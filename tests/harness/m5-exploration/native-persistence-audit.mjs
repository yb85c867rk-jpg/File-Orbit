import { createPersistenceRepository, buildSaveSnapshot, buildRecoverySnapshot, createRecoveryWorkspaceId, createRecoveryWorkspaceToken, META_LIBRARY_USAGE, META_RECOVERY_USAGE } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

const classification = { format: 'text', badge: 'TXT', needsReview: false };
let sequence = 0;
const nextAttachmentId = () => `att_${String(++sequence).padStart(12, '0')}`;
function treeFor(body, label = 'note.txt') {
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const file = new File([body], label, { type: 'text/plain' });
  const staged = registry.stage(file, classification); registry.commit(staged.id);
  return {
    registry,
    tree: { id: 'root', kind: 'folder', name: 'Native Audit', children: [{ id: 'file-0', kind: 'file', name: label, data: { dataType: 'file', description: 'native audit', attachmentId: staged.id, originalName: label, sizeBytes: body.length, mime: 'text/plain', classification } }] }
  };
}
async function legacySnapshot(body) {
  const { tree, registry } = treeFor(body, 'legacy.txt');
  return buildSaveSnapshot({ tree, registry, datasetToken: 1, capturedRevision: 1, allocateAttachmentId: nextAttachmentId });
}
async function recoverySnapshot(workspaceId, body) {
  const { tree, registry } = treeFor(body, 'recovery.txt');
  return buildRecoverySnapshot({ tree, registry, mapping: new Map(), datasetToken: 1, capturedRevision: 1, workspaceId, allocateAttachmentId: nextAttachmentId });
}
async function workspace(repo) {
  const workspaceId = createRecoveryWorkspaceId(); const workspaceToken = createRecoveryWorkspaceToken();
  const created = await repo.createRecoveryWorkspace({ workspaceId, workspaceToken });
  return { ...created.workspace, workspaceId, workspaceToken };
}
function repoFor(dbName, { indexedDB: factory = indexedDB, cap = 1024 * 1024 } = {}) {
  return createPersistenceRepository({ indexedDB: factory, dbName, mapIdFactory: () => `map_${String(++sequence).padStart(12, '0')}`, libraryHardCapBytes: cap, storageManager: null });
}
function abortingFactory() {
  let abortNext = false;
  const factory = {
    open(name, version) {
      const request = indexedDB.open(name, version);
      request.addEventListener('success', () => {
        const db = request.result; const original = db.transaction.bind(db);
        db.transaction = (stores, mode) => {
          const tx = original(stores, mode);
          if (mode === 'readwrite' && abortNext) {
            abortNext = false;
            const originalStore = tx.objectStore.bind(tx);
            tx.objectStore = (storeName) => {
              const store = originalStore(storeName); const put = store.put.bind(store); const add = store.add.bind(store);
              const abortAfter = (request) => { setTimeout(() => { try { tx.abort(); } catch {} }, 0); return request; };
              store.put = (...args) => abortAfter(put(...args));
              store.add = (...args) => abortAfter(add(...args));
              return store;
            };
          }
          return tx;
        };
      });
      return request;
    }
  };
  return { factory, arm() { abortNext = true; } };
}
function deleteDb(name) { return new Promise((resolve) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }); }
function errCode(error) { return error?.code || error?.name || String(error); }
async function verifyDb(dbName) {
  const repo = repoFor(dbName);
  const candidates = await repo.listRecoveryCandidates();
  const usage = await repo.combinedUsage();
  let checkpoint = null; let bytes = [];
  if (candidates[0]) {
    const loaded = await repo.loadRecoveryCheckpoint(candidates[0].workspace.workspaceId);
    checkpoint = loaded.checkpoint; bytes = await Promise.all(loaded.attachments.map(async (a) => ({ name: a.metadata.originalName, text: await a.blob.text(), sha: a.sha256 })));
  }
  repo.close();
  return { candidates: candidates.length, usage, nodeCount: checkpoint?.nodeCount || null, tree: checkpoint?.tree || null, bytes };
}
export async function runNativeAudit({ iterations = 5, runId = 'r149' } = {}) {
  const started = performance.now(); const repeated = [];
  for (let i = 0; i < iterations; i += 1) {
    const dbName = `r149-native-${runId}-${i}`;
    await deleteDb(dbName);
    const repo = repoFor(dbName, { cap: 60 });
    await repo.save(await legacySnapshot('a'.repeat(10)));
    const ws = await workspace(repo);
    const initial = await repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await recoverySnapshot(ws.workspaceId, 'b'.repeat(10)) });
    const nextLegacy = await legacySnapshot('c'.repeat(40));
    const nextRecovery = await recoverySnapshot(ws.workspaceId, 'd'.repeat(40));
    const results = await Promise.allSettled([
      repo.save(nextLegacy),
      repo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: initial.workspace.controlVersion, snapshot: nextRecovery })
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    const usage = await repo.combinedUsage();
    const loaded = await repo.loadRecoveryCheckpoint(ws.workspaceId);
    const priorIntact = loaded.checkpoint.checkpointGeneration === initial.generation && (await loaded.attachments[0].blob.text()) === 'b'.repeat(10);
    repo.close();
    const reopened = await verifyDb(dbName);
    await deleteDb(dbName);
    repeated.push({ iteration: i, fulfilled, rejected, usage, priorIntact, reopen: { candidates: reopened.candidates, nodeCount: reopened.nodeCount, bytes: reopened.bytes.map((b) => b.name), usage: reopened.usage }, errors: results.filter((r) => r.status === 'rejected').map((r) => errCode(r.reason)) });
  }
  // Abort uses a native write transaction intercepted to abort after its first put.
  const abortDb = `r149-native-${runId}-abort`;
  await deleteDb(abortDb);
  const { factory, arm } = abortingFactory();
  const abortRepo = repoFor(abortDb, { indexedDB: factory });
  const ws = await workspace(abortRepo);
  const first = await abortRepo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: ws.controlVersion, snapshot: await recoverySnapshot(ws.workspaceId, 'stable') });
  const before = await abortRepo.combinedUsage();
  arm();
  let abortCode = null;
  try { await abortRepo.saveRecoveryCheckpoint({ workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, expectedControlVersion: first.workspace.controlVersion, snapshot: await recoverySnapshot(ws.workspaceId, 'replacement') }); }
  catch (error) { abortCode = errCode(error); }
  const after = await abortRepo.combinedUsage();
  const loadedAfterAbort = await abortRepo.loadRecoveryCheckpoint(ws.workspaceId);
  const abortIntact = loadedAfterAbort.checkpoint.checkpointGeneration === first.generation && (await loadedAfterAbort.attachments[0].blob.text()) === 'stable';
  abortRepo.close();
  await deleteDb(abortDb);
  // Persist DB for browser-restart verification.
  const persistDb = `r149-native-${runId}-persist`;
  await deleteDb(persistDb);
  const persistRepo = repoFor(persistDb);
  const pws = await workspace(persistRepo);
  await persistRepo.saveRecoveryCheckpoint({ workspaceId: pws.workspaceId, workspaceToken: pws.workspaceToken, expectedControlVersion: pws.controlVersion, snapshot: await recoverySnapshot(pws.workspaceId, 'persisted-native-bytes') });
  persistRepo.close();
  const persisted = await verifyDb(persistDb);
  return { iterations, repeated, abort: { abortCode, before, after, abortIntact }, persist: { dbName: persistDb, candidates: persisted.candidates, nodeCount: persisted.nodeCount, bytes: persisted.bytes, usage: persisted.usage }, durationMs: performance.now() - started };
}
export async function verifyNativePersisted(dbName) { return verifyDb(dbName); }
