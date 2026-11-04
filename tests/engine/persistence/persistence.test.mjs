/*
 * P1a repository/codec tests run against the repository implementation and an
 * IndexedDB-compatible test double (fake-indexeddb.mjs).
 *
 * The double models asynchronous requests, staged readwrite transactions,
 * rollback on abort, upgrade transactions, indexes, and versionchange closure.
 * It does NOT model real browser disk quotas, process-level transaction
 * serialization across tabs, crash durability, or browser eviction. Native
 * browser verification remains NOT RUN and is not implied by these tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { FakeIndexedDB } from './fake-indexeddb.mjs';
import {
  buildSaveSnapshot, createAttachmentId, createPersistenceRepository,
  createRestoredAttachmentRegistry, loadSavedMapRuntime, reconstructSavedMapRuntime,
  openPersistenceDatabase, PersistenceError
} from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

let sequence = 0;
const nextMapId = () => `map_${String(++sequence).padStart(12, '0')}`;
const nextAttachmentId = () => `att_${String(++sequence).padStart(12, '0')}`;
const text = (blob) => blob.text();
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

function file(name, body, type = 'text/plain') { return new File([body], name, { type }); }
function classification(format = 'text', badge = 'TXT') { return { format, badge, needsReview: false }; }

function sampleTree() {
  return {
    id: 'root', name: 'Map', kind: 'folder', data: {},
    children: [{
      id: 'node-file', name: 'note.txt', kind: 'file',
      data: {
        dataType: 'file', description: 'A note', attachmentId: null,
        originalName: '', sizeBytes: 0, mime: '', classification: classification()
      }
    }]
  };
}

function sampleSession({ body = 'hello', fileName = 'note.txt' } = {}) {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const staged = registry.stage(file(fileName, body), classification());
  registry.commit(staged.id);
  const tree = sampleTree();
  const node = tree.children[0];
  node.name = fileName;
  node.data.attachmentId = staged.id;
  node.data.originalName = fileName;
  node.data.sizeBytes = body.length;
  node.data.mime = 'text/plain';
  return { tree, registry, mapping: new Map(), mapId: null, generation: null, revision: 0, datasetToken: 1 };
}

function snapshotFor(session, overrides = {}) {
  return buildSaveSnapshot({
    tree: session.tree,
    registry: session.registry,
    mapping: session.mapping,
    mapId: session.mapId,
    expectedGeneration: session.generation,
    datasetToken: session.datasetToken,
    capturedRevision: session.revision,
    allocateAttachmentId: nextAttachmentId,
    ...overrides
  });
}

function adoptSave(session, result) {
  session.mapId = result.mapId;
  session.generation = result.generation;
  session.mapping = result.mapping;
  return result;
}

function setup(options = {}) {
  const factory = new FakeIndexedDB();
  const repo = createPersistenceRepository({
    indexedDB: factory, dbName: options.dbName || `db-${++sequence}`,
    mapIdFactory: options.mapIdFactory || nextMapId,
    libraryHardCapBytes: options.libraryHardCapBytes,
    storageManager: options.storageManager || null,
    now: () => new Date(`2026-01-0${Math.min(9, (sequence % 9) + 1)}T00:00:00.000Z`)
  });
  return { factory, repo };
}

test('first save, load, list, usage, and runtime adoption preserve tree and bytes', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const snapshot = snapshotFor(session);
  assert.equal(session.tree.children[0].data.attachmentId, 'att-1-0');
  assert.equal(snapshot.tree.children[0].data.attachmentId.startsWith('att_'), true);
  assert.equal(session.mapping.size, 0);
  const result = await repo.save(snapshot);
  assert.equal(result.ok, true);
  assert.equal(result.generation, 1);
  assert.equal(result.libraryBytes, 5);
  adoptSave(session, result);
  const loaded = await repo.load(result.mapId);
  assert.equal(loaded.map.name, 'Map');
  assert.equal(loaded.document.tree.children[0].id, 'node-file');
  assert.equal(loaded.attachments.length, 1);
  assert.equal(await text(loaded.attachments[0].blob), 'hello');
  assert.equal(loaded.map.attachmentBytes, 5);
  const listed = await repo.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].mapId, result.mapId);
  const usage = await repo.usage();
  assert.equal(usage.storedAttachmentBytes, 5);
  assert.equal(usage.updatedAt, loaded.map.savedAt);
  assert.equal(usage.libraryHardCapBytes, 512 * 1024 * 1024);
  assert.equal(usage.estimate.status, 'unavailable');
  const runtime = reconstructSavedMapRuntime({ loaded, datasetToken: 22, viewport: { width: 900, height: 600 } });
  assert.equal(runtime.tree.id, 'root');
  assert.equal(runtime.attachmentIds.get(loaded.attachments[0].attachmentId), loaded.attachments[0].attachmentId);
  assert.equal(await text(runtime.registry.get(loaded.attachments[0].attachmentId).file), 'hello');
  runtime.dispose();
  repo.close();
});

test('proposal does not mutate live tree, registry, history-like snapshot, or caller mapping', () => {
  const session = sampleSession();
  const originalMapping = session.mapping;
  const originalTree = cloneJson(session.tree);
  const snapshot = snapshotFor(session);
  assert.deepEqual(cloneJson(session.tree), originalTree);
  assert.equal(session.mapping, originalMapping);
  assert.equal(session.mapping.size, 0);
  assert.equal(snapshot.mapping.size, 1);
  assert.notEqual(snapshot.tree.children[0].data.attachmentId, session.tree.children[0].data.attachmentId);
  assert.equal(session.registry.get('att-1-0').file.size, 5);
});

test('metadata-only save reuses persistent IDs and writes no attachment Blob', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session));
  adoptSave(session, first);
  const persistentId = first.mapping.get('att-1-0');
  session.tree.name = 'Map renamed';
  session.tree.children[0].data.description = 'Edited';
  session.revision = 1;
  const second = await repo.save(snapshotFor(session));
  assert.equal(second.generation, 2);
  assert.equal(second.wroteAttachmentCount, 0);
  assert.equal(second.mapping.get('att-1-0'), persistentId);
  assert.equal((await repo.load(second.mapId)).document.tree.name, 'Map renamed');
  repo.close();
});

test('add file save writes only the new Blob and preserves old mapping', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const secondId = 'att-1-1';
  const staged = session.registry.stage(file('second.md', '# second', 'text/markdown'), { format: 'markdown', badge: 'MD', needsReview: false });
  session.registry.commit(staged.id);
  session.tree.children.push({
    id: 'node-second', name: 'second.md', kind: 'file',
    data: {
      dataType: 'file', description: null, attachmentId: staged.id,
      originalName: 'second.md', sizeBytes: 8, mime: 'text/markdown',
      classification: { format: 'markdown', badge: 'MD', needsReview: false }
    }
  });
  session.revision = 1;
  const second = await repo.save(snapshotFor(session));
  assert.equal(second.wroteAttachmentCount, 1);
  assert.equal(second.mapping.get('att-1-0'), first.mapping.get('att-1-0'));
  assert.equal(second.mapping.get(secondId).startsWith('att_'), true);
  const loaded = await repo.load(second.mapId);
  assert.equal(loaded.attachments.length, 2);
  repo.close();
});

test('delete save removes durable row, Undo save reinserts missing bytes', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const removedNode = session.tree.children.pop();
  session.revision = 1;
  const deleted = await repo.save(snapshotFor(session)); adoptSave(session, deleted);
  assert.equal(deleted.wroteAttachmentCount, 0);
  assert.equal((await repo.load(deleted.mapId)).attachments.length, 0);
  session.tree.children.push(removedNode);
  session.revision = 2;
  const restored = await repo.save(snapshotFor(session)); adoptSave(session, restored);
  assert.equal(restored.wroteAttachmentCount, 1);
  const loaded = await repo.load(restored.mapId);
  assert.equal(await text(loaded.attachments[0].blob), 'hello');
  repo.close();
});

test('failed transaction leaves prior records and mapping unchanged; retry commits', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const mappingBefore = new Map(session.mapping);
  session.tree.name = 'Should not commit';
  session.revision = 1;
  factory.failNextWrite = 'mapDocuments';
  await assert.rejects(() => repo.save(snapshotFor(session)), (error) => error instanceof PersistenceError);
  const still = await repo.load(first.mapId);
  assert.equal(still.map.name, 'Map');
  assert.equal(still.map.generation, 1);
  assert.deepEqual(session.mapping, mappingBefore);
  const retry = await repo.save(snapshotFor(session));
  assert.equal(retry.generation, 2);
  assert.equal((await repo.load(first.mapId)).map.name, 'Should not commit');
  repo.close();
});

test('stale generation and new-map ID collision are rejected', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  session.tree.name = 'First update'; session.revision = 1;
  const updated = await repo.save(snapshotFor(session)); adoptSave(session, updated);
  session.tree.name = 'Stale update'; session.revision = 2;
  await assert.rejects(() => repo.save(snapshotFor(session, { expectedGeneration: 1 })), (error) => error.code === 'stale-generation');
  const collisionRepo = createPersistenceRepository({
    indexedDB: factory, dbName: [...factory.databases.keys()][0], mapIdFactory: () => first.mapId
  });
  const other = sampleSession();
  await assert.rejects(() => collisionRepo.save(snapshotFor(other)), (error) => error.code === 'map-id-collision');
  collisionRepo.close(); repo.close();
});

test('missing, size-mismatched, unused, and incompatible saved records fail explicitly', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const saved = await repo.save(snapshotFor(session)); adoptSave(session, saved);
  const db = factory.databases.get(repo ? [...factory.databases.keys()][0] : '');
  const attachmentRows = db._stores.get('mapAttachments').records;
  const key = [...attachmentRows.keys()][0];
  const savedRow = attachmentRows.get(key);
  attachmentRows.delete(key);
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-missing');
  attachmentRows.set(key, { ...savedRow, sizeBytes: savedRow.sizeBytes + 1 });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-size-mismatch' || /size/i.test(error.message));
  attachmentRows.set(key, savedRow);
  const document = db._stores.get('mapDocuments').records.get(saved.mapId);
  db._stores.get('mapDocuments').records.set(saved.mapId, { ...document, schemaVersion: 99 });
  await assert.rejects(() => repo.load(saved.mapId), (error) => /schema/i.test(error.message));
  repo.close();
});

test('per-file, per-map, node, and application library limits are enforced', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1, maxFileBytes: 25 * 1024 * 1024, maxTotalBytes: 200 * 1024 * 1024 });
  const big = { name: 'big.bin', size: 21 * 1024 * 1024, type: '', slice() {} };
  const staged = registry.stage(big, classification('generic', 'BIN')); registry.commit(staged.id);
  const tree = { id: 'root', name: 'Large', kind: 'folder', data: {}, children: [{ id: 'f', name: 'big.bin', kind: 'file', data: { dataType: 'file', attachmentId: staged.id, originalName: 'big.bin', sizeBytes: big.size, mime: '', classification: classification('generic', 'BIN') } }] };
  assert.throws(() => buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0, allocateAttachmentId: nextAttachmentId }), (error) => error.code === 'attachment-too-large');

  const many = { id: 'root', name: 'Many', kind: 'folder', data: {}, children: Array.from({ length: 300 }, (_, index) => ({ id: `n-${index}`, name: `n-${index}`, kind: 'file', data: { dataType: 'legacy' } })) };
  assert.throws(() => buildSaveSnapshot({ tree: many, registry: createAttachmentRegistry({ datasetToken: 1 }), datasetToken: 1, capturedRevision: 0 }), (error) => error.code === 'node-limit');
});

test('application hard cap and multiple repository connections enforce usage', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 10, dbName: 'cap-db' });
  const first = sampleSession({ body: '12345' });
  const saved = await repo.save({ ...snapshotFor(first), mapId: null });
  const secondRepo = createPersistenceRepository({ indexedDB: factory, dbName: 'cap-db', mapIdFactory: nextMapId, libraryHardCapBytes: 10 });
  const second = sampleSession({ body: '123456' });
  await assert.rejects(() => secondRepo.save(snapshotFor(second)), (error) => error.code === 'library-limit');
  const listed = await repo.list();
  assert.equal(listed.length, 1);
  assert.equal((await repo.usage()).storedAttachmentBytes, 5);
  secondRepo.close(); repo.close();
});

test('atomic deletion removes only one map and accounting; missing deletion is explicit', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 100 });
  const first = sampleSession({ body: '12345' });
  const firstSaved = await repo.save(snapshotFor(first));
  const second = sampleSession({ body: 'abcdef' });
  const secondRepo = createPersistenceRepository({ indexedDB: factory, dbName: [...factory.databases.keys()][0], mapIdFactory: nextMapId, libraryHardCapBytes: 100 });
  const secondSaved = await secondRepo.save(snapshotFor(second));
  assert.equal((await repo.usage()).storedAttachmentBytes, 11);
  const removed = await repo.remove(firstSaved.mapId);
  assert.equal(removed.removedAttachments, 1);
  assert.equal((await repo.usage()).storedAttachmentBytes, 6);
  const remaining = await repo.load(secondSaved.mapId);
  assert.equal(await text(remaining.attachments[0].blob), 'abcdef');
  await assert.rejects(() => repo.load(firstSaved.mapId), (error) => error.code === 'map-missing');
  await assert.rejects(() => repo.remove(firstSaved.mapId), (error) => error.code === 'map-missing');
  secondRepo.close(); repo.close();
});

test('stored attachments use structural metadata only and usage repair restores accounting', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const rows = db._stores.get('mapAttachments').records;
  const row = [...rows.values()][0];
  assert.equal(row.sha256, null);
  db._stores.get('meta').records.get('libraryUsage').storedAttachmentBytes = 0;
  session.tree.children[0].data.description = 'after corrupt usage';
  session.revision = 1;
  const second = await repo.save(snapshotFor(session)); adoptSave(session, second);
  assert.equal(second.usageRepaired, true);
  assert.equal((await repo.usage()).storedAttachmentBytes, 5);
  const mapRecord = db._stores.get('maps').records.get(first.mapId);
  db._stores.get('maps').records.set(first.mapId, { ...mapRecord, attachmentBytes: 999 });
  db._stores.get('meta').records.set('libraryUsage', { key: 'libraryUsage', storedAttachmentBytes: 999 });
  const repaired = await repo.repairUsage();
  assert.equal(repaired.libraryBytes, 5);
  assert.equal((await repo.load(first.mapId)).map.attachmentBytes, 5);
  repo.close();
});
test('accounting reconciles actual attachment rows and cannot be bypassed by corrupt summaries', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 10 });
  const first = sampleSession({ body: '12345' });
  const firstSaved = await repo.save(snapshotFor(first));
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const maps = db._stores.get('maps').records;
  const firstMeta = maps.get(firstSaved.mapId);
  maps.set(firstSaved.mapId, { ...firstMeta, attachmentBytes: 0, storedAttachmentCount: 0 });
  db._stores.get('meta').records.get('libraryUsage').storedAttachmentBytes = 0;
  const second = sampleSession({ body: '123456' });
  await assert.rejects(() => repo.save(snapshotFor(second)), (error) => error.code === 'library-limit');
  assert.equal((await repo.list()).length, 1);
  const repaired = await repo.repairUsage();
  assert.equal(repaired.libraryBytes, 5);
  assert.equal((await repo.usage()).storedAttachmentBytes, 5);
  assert.equal((await repo.load(firstSaved.mapId)).map.attachmentBytes, 5);
  repo.close();
});

test('overreported summaries are reconciled without a false library rejection', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 20 });
  const first = sampleSession({ body: '12345' });
  const firstSaved = await repo.save(snapshotFor(first));
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const maps = db._stores.get('maps').records;
  const firstMeta = maps.get(firstSaved.mapId);
  maps.set(firstSaved.mapId, { ...firstMeta, attachmentBytes: 999, storedAttachmentCount: 999 });
  db._stores.get('meta').records.get('libraryUsage').storedAttachmentBytes = 999;
  const second = sampleSession({ body: '123456' });
  const secondSaved = await repo.save(snapshotFor(second));
  assert.equal(secondSaved.libraryBytes, 11);
  const listed = await repo.list();
  assert.equal(listed.find((map) => map.mapId === firstSaved.mapId).attachmentBytes, 5);
  assert.equal(listed.find((map) => map.mapId === secondSaved.mapId).attachmentBytes, 6);
  repo.close();
});

test('missing usage, per-map count corruption, and remove reconcile actual rows', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 20 });
  const first = sampleSession({ body: '12345' });
  const firstSaved = await repo.save(snapshotFor(first)); adoptSave(first, firstSaved);
  const db = factory.databases.get([...factory.databases.keys()][0]);
  db._stores.get('meta').records.delete('libraryUsage');
  first.tree.children[0].data.description = 'metadata';
  first.revision = 1;
  const second = await repo.save(snapshotFor(first)); adoptSave(first, second);
  assert.equal(second.usageRepaired, true);
  assert.equal((await repo.usage()).storedAttachmentBytes, 5);
  const firstMap = db._stores.get('maps').records.get(firstSaved.mapId);
  db._stores.get('maps').records.set(firstSaved.mapId, { ...firstMap, storedAttachmentCount: 99 });
  const repaired = await repo.repairUsage();
  assert.equal(repaired.libraryBytes, 5);
  assert.equal((await repo.load(firstSaved.mapId)).map.storedAttachmentCount, 1);
  const removed = await repo.remove(firstSaved.mapId);
  assert.equal(removed.libraryBytes, 0);
  assert.equal((await repo.usage()).storedAttachmentBytes, 0);
  repo.close();
});

test('load rejects tree/document/row attachment metadata mismatches and malformed classification', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const saved = await repo.save(snapshotFor(session)); adoptSave(session, saved);
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const docs = db._stores.get('mapDocuments').records;
  const original = docs.get(saved.mapId);
  const mutateTree = (mutator) => {
    const doc = structuredClone(original);
    mutator(doc.tree.children[0].data);
    docs.set(saved.mapId, doc);
  };
  mutateTree((data) => { data.classification = { format: 'pdf', badge: 'PDF', needsReview: false }; });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-classification-mismatch');
  mutateTree((data) => { data.originalName = 'other.txt'; });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-metadata-mismatch');
  mutateTree((data) => { data.sizeBytes = 999; });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-size-mismatch');
  mutateTree((data) => { data.mime = 'application/pdf'; });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-metadata-mismatch');
  mutateTree((data) => { data.classification = { format: 7 }; });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'invalid-classification');
  docs.set(saved.mapId, original);
  assert.equal((await repo.load(saved.mapId)).document.tree.id, 'root');
  repo.close();
});

test('load validates map identity, node count, name, and aggregate limits', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const saved = await repo.save(snapshotFor(session));
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const maps = db._stores.get('maps').records;
  const docs = db._stores.get('mapDocuments').records;
  const mapRecord = maps.get(saved.mapId);
  const doc = docs.get(saved.mapId);
  maps.set(saved.mapId, { ...mapRecord, nodeCount: 99 });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'node-count-inconsistent');
  maps.set(saved.mapId, mapRecord);
  docs.set(saved.mapId, { ...doc, mapId: 'map_other' });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'identity-inconsistent');
  docs.set(saved.mapId, doc);
  maps.set(saved.mapId, { ...mapRecord, name: 'Other name' });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'name-inconsistent');
  maps.set(saved.mapId, mapRecord);
  docs.set(saved.mapId, { ...doc, generation: 9 });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'generation-inconsistent');
  repo.close();
});

test('valid repeated attachment references load and reconstruct with one Blob', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const attached = session.tree.children[0];
  const copy = structuredClone(attached);
  copy.id = 'node-file-2'; copy.name = 'copy.txt';
  session.tree.children.push(copy);
  const saved = await repo.save(snapshotFor(session));
  const loaded = await repo.load(saved.mapId);
  assert.equal(loaded.attachments.length, 1);
  assert.equal(loaded.map.storedAttachmentCount, 1);
  assert.equal(loaded.document.tree.children.length, 2);
  assert.equal(loaded.document.tree.children[1].data.attachmentId, loaded.attachments[0].attachmentId);
  repo.close();
});

test('repository save boundary rejects mutated snapshot trees, counts, payloads, and metadata', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const saved = await repo.save(snapshotFor(session)); adoptSave(session, saved);
  const base = snapshotFor(session);
  const missingRef = structuredClone(base);
  missingRef.tree.children[0].data.attachmentId = 'att_missing_payload';
  await assert.rejects(() => repo.save(missingRef), (error) => error.code === 'missing-attachment-payload');
  const wrongCount = { ...base, nodeCount: 99 };
  await assert.rejects(() => repo.save(wrongCount), (error) => error.code === 'node-count-mismatch');
  const invalidTree = structuredClone(base);
  invalidTree.tree.children.push({ id: 'bad', name: 'bad', kind: 'file', data: { dataType: 'legacy' }, children: [{ id: 'child', name: 'child', kind: 'folder', data: {}, children: [] }] });
  invalidTree.nodeCount += 2;
  await assert.rejects(() => repo.save(invalidTree), (error) => error.code === 'file-children');
  const unused = structuredClone(base);
  unused.attachments.push({ ...unused.attachments[0], persistentId: 'att_unused_payload', sessionId: 'unused' });
  await assert.rejects(() => repo.save(unused), (error) => error.code === 'unused-attachment-payload');
  const mismatch = structuredClone(base);
  mismatch.tree.children[0].data.sizeBytes += 1;
  await assert.rejects(() => repo.save(mismatch), (error) => error.code === 'attachment-size-mismatch');
  assert.equal((await repo.load(saved.mapId)).map.generation, saved.generation);
  repo.close();
});

test('repository copies an owned payload before pending async work and rejects caller mutation', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const snapshot = snapshotFor(session);
  const pending = repo.save(snapshot);
  snapshot.tree.children[0].data.attachmentId = 'att_mutated_after_call';
  snapshot.attachments.length = 0;
  const saved = await pending;
  const loaded = await repo.load(saved.mapId);
  assert.equal(loaded.document.tree.children[0].data.attachmentId.startsWith('att_'), true);
  assert.equal(loaded.attachments.length, 1);
  assert.equal(await text(loaded.attachments[0].blob), 'hello');
  repo.close();
});

test('orphan durable rows remain counted and cannot be silently excluded', async () => {
  const { factory, repo } = setup({ libraryHardCapBytes: 10 });
  const first = sampleSession({ body: '12345' });
  await repo.save(snapshotFor(first));
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const orphanId = 'att_orphan_row';
  const orphanBlob = new Blob(['xyz'], { type: 'text/plain' });
  db._stores.get('mapAttachments').records.set(JSON.stringify(['map_orphan_owner', orphanId]), {
    mapId: 'map_orphan_owner', attachmentId: orphanId, blob: orphanBlob,
    originalName: 'orphan.txt', sizeBytes: 3, mime: 'text/plain',
    classification: classification(), sha256: null
  });
  const second = sampleSession({ body: '123456' });
  await assert.rejects(() => repo.save(snapshotFor(second)), (error) => error.code === 'library-limit');
  assert.equal((await repo.usage()).storedAttachmentBytes, 5);
  repo.close();
});

test('load rejects an aggregate attachment total above the per-map limit', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const saved = await repo.save(snapshotFor(session));
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const docs = db._stores.get('mapDocuments').records;
  const doc = docs.get(saved.mapId);
  const size = 20 * 1024 * 1024;
  const children = Array.from({ length: 6 }, (_, index) => ({
    id: `big-${index}`, name: `big-${index}.bin`, kind: 'file',
    data: { dataType: 'file', description: null, attachmentId: `att_big_${index}`, originalName: `big-${index}.bin`, sizeBytes: size, mime: '', classification: classification('generic', 'BIN') }
  }));
  const tree = { ...doc.tree, children };
  const refs = children.map((node) => ({ attachmentId: node.data.attachmentId, originalName: node.data.originalName, sizeBytes: size, mime: '', classification: classification('generic', 'BIN') }));
  docs.set(saved.mapId, { ...doc, tree, attachmentRefs: refs });
  const maps = db._stores.get('maps').records;
  maps.set(saved.mapId, { ...maps.get(saved.mapId), nodeCount: 7, attachmentBytes: size * 6, storedAttachmentCount: 6 });
  const rows = db._stores.get('mapAttachments').records;
  for (const key of [...rows.keys()]) rows.delete(key);
  for (const ref of refs) rows.set(JSON.stringify([saved.mapId, ref.attachmentId]), {
    mapId: saved.mapId, attachmentId: ref.attachmentId, blob: { size },
    originalName: ref.originalName, sizeBytes: size, mime: '', classification: ref.classification, sha256: null
  });
  await assert.rejects(() => repo.load(saved.mapId), (error) => error.code === 'attachment-total-limit');
  repo.close();
});

test('metadata-only save reinserts a missing durable row and updates usage', async () => {
  const { factory, repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const db = factory.databases.get([...factory.databases.keys()][0]);
  const key = JSON.stringify([first.mapId, first.mapping.get('att-1-0')]);
  db._stores.get('mapAttachments').records.delete(key);
  session.tree.children[0].data.description = 'metadata only';
  session.revision = 1;
  const result = await repo.save(snapshotFor(session));
  assert.equal(result.wroteAttachmentCount, 1);
  assert.equal(await text((await repo.load(first.mapId)).attachments[0].blob), 'hello');
  repo.close();
});

test('legacy metadata and Unicode names survive, and runtime identity is not persisted', async () => {
  const { repo } = setup();
  const tree = {
    id: 'legacy-root', name: '한글 지도', kind: 'folder',
    data: { description: '레거시', nested: { unicode: '값', tags: ['a', 'b'] } },
    children: [{ id: 'legacy-file', name: '메모.txt', kind: 'file', data: { dataType: 'legacy', description: null } }]
  };
  const session = { tree, registry: createAttachmentRegistry({ datasetToken: 1 }), mapping: new Map(), mapId: null, revision: 0, datasetToken: 1 };
  const result = await repo.save(snapshotFor(session));
  const loaded = await repo.load(result.mapId);
  assert.equal(loaded.document.tree.name, '한글 지도');
  assert.equal(loaded.document.tree.data.nested.unicode, '값');
  assert.equal(loaded.document.tree.children[0].name, '메모.txt');
  const serialized = JSON.stringify(loaded.document);
  assert.equal(serialized.includes('datasetToken'), false);
  assert.equal(serialized.includes('dataRevision'), false);
  assert.equal(serialized.includes('objectURL'), false);
  repo.close();
});

test('restored registry supports Blob/File and rejects duplicate adoption; reconstruction cleans up failures', async () => {
  const adopted = createRestoredAttachmentRegistry({
    datasetToken: 3,
    attachments: [{
      attachmentId: 'att_saved', blob: new Blob(['saved'], { type: 'text/plain' }),
      metadata: { attachmentId: 'att_saved', originalName: 'saved.txt', sizeBytes: 5, mime: 'text/plain', classification: classification() }
    }]
  });
  assert.equal(adopted.registry.get('att_saved').name, 'saved.txt');
  assert.equal(adopted.attachmentIds.get('att_saved'), 'att_saved');
  const reservation = adopted.registry.reserve(file('new.txt', 'new'));
  assert.notEqual(reservation.id, 'att_saved');
  assert.throws(() => createRestoredAttachmentRegistry({
    datasetToken: 4,
    attachments: [
      { attachmentId: 'att_same', blob: new Blob(['a']), metadata: { attachmentId: 'att_same', originalName: 'a', sizeBytes: 1, mime: '', classification: null } },
      { attachmentId: 'att_same', blob: new Blob(['a']), metadata: { attachmentId: 'att_same', originalName: 'a', sizeBytes: 1, mime: '', classification: null } }
    ]
  }), (error) => error.code === 'attachment-adoption-failed');
  assert.throws(() => reconstructSavedMapRuntime({
    loaded: { map: { mapId: 'map_x', generation: 1, attachmentBytes: 0, nodeCount: 1 }, document: { tree: { id: 'bad', name: 'Bad', kind: 'file', data: {}, children: [{ id: 'child' }] } }, attachments: [] },
    datasetToken: 1, viewport: { width: 800, height: 600 }
  }), (error) => error instanceof PersistenceError);
  adopted.registry.clear();
});

test('unavailable, failed, versionchange, and closed connections are handled', async () => {
  const unavailable = createPersistenceRepository({ indexedDB: null });
  await assert.rejects(() => unavailable.list(), (error) => error.code === 'idb-unavailable');

  const failedFactory = new FakeIndexedDB(); failedFactory.failOpen = true;
  const failed = createPersistenceRepository({ indexedDB: failedFactory });
  await assert.rejects(() => failed.open(), (error) => error.code === 'idb-open-failed' || error.code === 'idb-invalid-state');

  const blockedFactory = new FakeIndexedDB();
  let blocked = false; let blockedRequest;
  const blockedIndexedDB = {
    open() {
      blockedRequest = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null };
      queueMicrotask(() => {
        blockedRequest.onblocked?.({});
        blockedRequest.error = Object.assign(new Error('blocked'), { name: 'InvalidStateError' });
        blockedRequest.onerror?.({});
      });
      return blockedRequest;
    }
  };
  await assert.rejects(() => openPersistenceDatabase({ indexedDB: blockedIndexedDB, onBlocked: () => { blocked = true; } }), (error) => error.code.startsWith('idb-'));
  assert.equal(blocked, true);

  const { factory, repo } = setup();
  let versionChanged = null;
  const versionRepo = createPersistenceRepository({ indexedDB: factory, dbName: 'version-db', mapIdFactory: nextMapId, onVersionChange: (info) => { versionChanged = info; } });
  await versionRepo.open();
  factory.fireVersionChange('version-db');
  assert.equal(versionChanged.name, 'version-db');
  assert.equal(versionRepo.closed, true);
  await assert.rejects(() => versionRepo.list(), (error) => error.code === 'idb-versionchange');
  versionRepo.close(); repo.close();
});

test('storage estimate is advisory and quota warning is reported without hard failure', async () => {
  const storageManager = { estimate: async () => ({ usage: 95, quota: 100 }) };
  const { repo } = setup({ storageManager });
  const session = sampleSession();
  const result = await repo.save(snapshotFor(session));
  assert.equal(result.quotaWarning, true);
  repo.close();
});

test('unsafe or extra node fields are rejected by snapshot construction', () => {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const tree = { id: 'root', name: 'Map', kind: 'folder', data: {}, children: [], extra: {} };
  assert.throws(() => buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 0 }), (error) => error.code === 'unknown-field');
  const fileTree = { id: 'root', name: 'Map', kind: 'folder', data: {}, children: [{ id: 'f', name: 'f', kind: 'file', data: { dataType: 'legacy' }, children: [{ id: 'c', name: 'c', kind: 'folder', data: {}, children: [] }] }] };
  assert.throws(() => buildSaveSnapshot({ tree: fileTree, registry, datasetToken: 1, capturedRevision: 0 }), (error) => error.code === 'file-children');
});
test('save boundary rejects null/deleted tree classification against a classified payload', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const base = snapshotFor(session);
  const beforeTree = structuredClone(base.tree);
  const beforeMapping = [...base.mapping.entries()];
  const beforeMetadata = base.attachments.map((attachment) => ({
    classification: attachment.classification,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    mime: attachment.mime,
    blob: attachment.blob
  }));
  const nullTree = structuredClone(base);
  nullTree.tree.children[0].data.classification = null;
  await assert.rejects(() => repo.save(nullTree), (error) => error.code === 'attachment-classification-mismatch');
  const deletedTree = structuredClone(base);
  delete deletedTree.tree.children[0].data.classification;
  await assert.rejects(() => repo.save(deletedTree), (error) => error.code === 'attachment-classification-mismatch');
  const nullPayload = structuredClone(base);
  nullPayload.attachments[0].classification = null;
  await assert.rejects(() => repo.save(nullPayload), (error) => error.code === 'attachment-classification-mismatch');
  assert.deepEqual(cloneJson(base.tree), cloneJson(beforeTree));
  assert.deepEqual([...base.mapping.entries()], beforeMapping);
  assert.deepEqual(base.attachments.map((attachment) => ({
    classification: attachment.classification,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    mime: attachment.mime,
    blob: attachment.blob
  })), beforeMetadata);
  assert.equal((await repo.list()).length, 0);
  assert.equal((await repo.usage()).storedAttachmentBytes, 0);
  repo.close();
});

test('rejected overwrite preserves tree, attachment metadata, generation, and usage', async () => {
  const { repo } = setup();
  const session = sampleSession();
  const first = await repo.save(snapshotFor(session)); adoptSave(session, first);
  const before = await repo.load(first.mapId);
  const beforeUsage = await repo.usage();
  const rejected = snapshotFor(session);
  rejected.tree.children[0].data.classification = null;
  await assert.rejects(() => repo.save(rejected), (error) => error.code === 'attachment-classification-mismatch');
  const after = await repo.load(first.mapId);
  assert.equal(after.map.generation, before.map.generation);
  assert.equal(after.map.attachmentBytes, before.map.attachmentBytes);
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(await repo.usage(), beforeUsage);
  assert.equal((await repo.list())[0].generation, first.generation);
  repo.close();
});

test('both classifications null save and load consistently; matching non-null and key-order-equivalent classifications succeed', async () => {
  const nullRepoSetup = setup();
  const nullSession = sampleSession();
  const nullSnapshot = snapshotFor(nullSession);
  nullSnapshot.tree.children[0].data.classification = null;
  nullSnapshot.attachments[0].classification = null;
  const nullSaved = await nullRepoSetup.repo.save(nullSnapshot);
  const nullLoaded = await nullRepoSetup.repo.load(nullSaved.mapId);
  assert.equal(nullLoaded.document.tree.children[0].data.classification, null);
  assert.equal(nullLoaded.document.attachmentRefs[0].classification, null);
  assert.equal(nullLoaded.attachments[0].metadata.classification, null);
  nullRepoSetup.repo.close();

  const textRepo = setup();
  const textSession = sampleSession();
  const normal = await textRepo.repo.save(snapshotFor(textSession));
  const normalLoaded = await textRepo.repo.load(normal.mapId);
  assert.equal(normalLoaded.attachments[0].metadata.classification.format, 'text');

  const orderSession = sampleSession();
  const ordered = snapshotFor(orderSession);
  ordered.attachments[0].classification = { needsReview: false, badge: 'TXT', format: 'text' };
  const orderSaved = await textRepo.repo.save(ordered);
  const orderLoaded = await textRepo.repo.load(orderSaved.mapId);
  assert.equal(orderLoaded.document.tree.children[0].data.classification.format, 'text');
  textRepo.repo.close();
});



test('repository save/open accepts 300 nodes and rejects 301 without replacing the saved map', async () => {
  const { repo } = setup();
  const makeTree = (count) => ({
    id: 'root', name: 'Boundary', kind: 'folder', data: {},
    children: Array.from({ length: count - 1 }, (_, index) => ({
      id: `n-${index}`, name: `n-${index}.txt`, kind: 'file', data: { dataType: 'legacy' }
    }))
  });
  const session = { tree: makeTree(300), registry: createAttachmentRegistry({ datasetToken: 1 }), mapping: new Map(), mapId: null, generation: null, revision: 0, datasetToken: 1 };
  const snapshot = snapshotFor(session);
  assert.equal(snapshot.nodeCount, 300);
  const saved = await repo.save(snapshot);
  const loaded = await repo.load(saved.mapId);
  assert.equal(loaded.map.nodeCount, 300);
  assert.equal(loaded.document.tree.children.length, 299);
  const generationBefore = loaded.map.generation;
  const listBefore = (await repo.list()).length;
  const forged = { ...snapshot, mapId: saved.mapId, expectedGeneration: saved.generation, tree: makeTree(301), nodeCount: 301 };
  await assert.rejects(() => repo.save(forged), (error) => error.code === 'node-limit');
  assert.equal((await repo.list()).length, listBefore);
  const still = await repo.load(saved.mapId);
  assert.equal(still.map.generation, generationBefore);
  assert.equal(still.map.nodeCount, 300);
  assert.equal(still.document.tree.children.length, 299);
  repo.close();
});
