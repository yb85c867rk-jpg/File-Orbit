import { attachmentRefsFromSnapshot, ownSaveSnapshot } from './codec.js';
import {
  APPLICATION_LIBRARY_HARD_CAP_BYTES,
  DB_VERSION,
  MAX_SAVED_MAP_ATTACHMENT_BYTES,
  META_LIBRARY_USAGE,
  META_RECOVERY_USAGE,
  META_SCHEMA,
  PersistenceError,
  QUOTA_SAFETY_RESERVE_BYTES,
  SCHEMA_VERSION,
  STORE_ATTACHMENTS,
  STORE_DOCUMENTS,
  STORE_MAPS,
  STORE_META,
  STORE_RECOVERY_ATTACHMENTS,
  STORE_RECOVERY_CHECKPOINTS,
  STORE_RECOVERY_WORKSPACES,
  normalizeAttachmentMime,
  sameClassification,
  validateAttachmentRecord,
  validateClassificationValue,
  validateDocumentRecord,
  validateMapMetadata
} from './schema.js';
import { createMapId, isPersistentId } from './ids.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';
import { resolvePolicyContext } from '../edition/context.js';
import { normalizeIdbError, openPersistenceDatabase, requestToPromise, transactionDone } from './idb.js';
import { createRecoveryRepository } from './recovery-repository.js';
import { validateRecoveryAttachmentRecord } from './recovery-schema.js';
import { loadTree } from '../data/tree-loader.js';
import { MAX_ATTACHMENT_BYTES } from '../editor/attachment-classification.js';

function nowIso(now) {
  const value = typeof now === 'function' ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function sameBlobMetadata(record, attachment) {
  return record
    && record.sizeBytes === attachment.sizeBytes
    && record.blob?.size === attachment.sizeBytes
    && record.originalName === attachment.originalName
    && record.mime === attachment.mime
    && JSON.stringify(record.classification ?? null) === JSON.stringify(attachment.classification ?? null);
}

function summarizeAttachmentRows(rows) {
  let total = 0;
  const byMap = new Map();
  for (const row of rows) {
    const error = validateAttachmentRecord(row);
    if (error) throw new PersistenceError('usage-corrupt', `Stored attachment record is invalid: ${error}`);
    const current = byMap.get(row.mapId) || { bytes: 0, count: 0 };
    current.bytes += row.sizeBytes;
    current.count += 1;
    byMap.set(row.mapId, current);
    total += row.sizeBytes;
  }
  return { total, byMap };
}

function reconcileMapSummaries(maps, actualByMap) {
  let changed = false;
  const records = [];
  for (const map of maps) {
    const actual = actualByMap.get(map.mapId) || { bytes: 0, count: 0 };
    const next = { ...map, attachmentBytes: actual.bytes, storedAttachmentCount: actual.count };
    if (next.attachmentBytes !== map.attachmentBytes || next.storedAttachmentCount !== map.storedAttachmentCount) changed = true;
    records.push(next);
  }
  return { records, changed };
}
function assertExistingDocumentCapacity(existingMap, existingDoc, policyContext) {
  if (!existingDoc) throw new PersistenceError('invalid-document-record', 'Saved document is missing.');
  const documentError = validateDocumentRecord(existingDoc);
  if (documentError) throw new PersistenceError('invalid-document-record', documentError);
  if (existingDoc.mapId !== existingMap.mapId) throw new PersistenceError('identity-inconsistent', 'Saved document identity does not match the map.');
  if (existingDoc.generation !== existingMap.generation) throw new PersistenceError('generation-inconsistent', 'Saved document generation does not match the map.');
  let loaded;
  try { loaded = loadTree(existingDoc.tree); }
  catch (error) { throw new PersistenceError('invalid-document-record', 'Saved map tree is invalid: ' + String(error?.message || error), { cause: error }); }
  const actual = loaded.graph.nodes.size;
  if (actual !== existingMap.nodeCount) throw new PersistenceError('node-count-mismatch', 'Stored map node count does not match the saved tree.');
  const nodeLimit = resolveSavedMapNodeLimit(undefined, policyContext);
  if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
  if (actual > nodeLimit.limit) throw new PersistenceError('node-limit', 'The existing saved map exceeds this context\'s node limit.');
}
function assertSnapshot(snapshot, policyContext = undefined) {
  if (!snapshot || typeof snapshot !== 'object') throw new PersistenceError('snapshot-required', 'A save snapshot is required.');
  if (!Array.isArray(snapshot.attachments)) throw new PersistenceError('snapshot-invalid', 'Snapshot attachments must be an array.');
  if (!snapshot.tree || typeof snapshot.tree !== 'object') throw new PersistenceError('snapshot-invalid', 'Snapshot tree is required.');
  if (!(snapshot.mapping instanceof Map)) throw new PersistenceError('snapshot-invalid', 'Snapshot mapping must be a Map.');
  if (!Number.isSafeInteger(snapshot.nodeCount) || snapshot.nodeCount < 1) throw new PersistenceError('snapshot-invalid', 'Snapshot node count is invalid.');
  const nodeLimit = resolveSavedMapNodeLimit(undefined, policyContext);
  if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
  if (snapshot.nodeCount > nodeLimit.limit) throw new PersistenceError('node-limit', 'Saved map node limit exceeded.');
  const ids = new Set();
  for (const attachment of snapshot.attachments) {
    if (!isPersistentId(attachment.persistentId, 'att_')) throw new PersistenceError('snapshot-invalid', 'Attachment persistent ID is invalid.');
    if (ids.has(attachment.persistentId)) throw new PersistenceError('snapshot-invalid', 'Snapshot contains duplicate attachment IDs.');
    ids.add(attachment.persistentId);
    if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes < 0) throw new PersistenceError('snapshot-invalid', 'Attachment size is invalid.');
    if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) throw new PersistenceError('attachment-too-large', 'Attachment exceeds the per-file limit.');
    if (!attachment.blob || attachment.blob.size !== attachment.sizeBytes) throw new PersistenceError('attachment-missing-live', 'Snapshot attachment Blob is missing or has the wrong size.');
  }
}

export function createPersistenceRepository({
  indexedDB = globalThis.indexedDB,
  dbName = 'fileorbit',
  dbVersion = DB_VERSION,
  mapIdFactory = createMapId,
  now = () => new Date(),
  storageManager = globalThis.navigator?.storage || null,
  libraryHardCapBytes = APPLICATION_LIBRARY_HARD_CAP_BYTES,
  quotaSafetyReserveBytes = QUOTA_SAFETY_RESERVE_BYTES,
  policyContext = undefined,
  onBlocked = () => {},
  onOpenSuccess = () => {},
  onVersionChange = () => {}
} = {}) {
  const resolvedPolicy = resolvePolicyContext(policyContext);
  if (!resolvedPolicy.ok) throw new PersistenceError(resolvedPolicy.reason, resolvedPolicy.message);
  const repositoryPolicyContext = resolvedPolicy.context;
  let handle = null;
  let opening = null;
  let versionChanged = false;
  let lifecycleToken = 0;

  async function open() {
    if (versionChanged) throw new PersistenceError('idb-versionchange', 'The storage schema changed. Reload FileOrbit before saving again.');
    if (handle && !handle.closed) return handle;
    if (opening) return opening;
    const token = ++lifecycleToken;
    opening = openPersistenceDatabase({
      indexedDB, name: dbName, version: dbVersion, onBlocked,
      onVersionChange: (info) => { versionChanged = true; onVersionChange(info); }
    })
      .then((opened) => {
        if (token !== lifecycleToken) {
          opened.close();
          throw new PersistenceError('idb-closed', 'The persistence connection was closed while opening.');
        }
        handle = opened;
        try { onOpenSuccess({ reused: false, name: dbName, version: dbVersion }); } catch {}
        return opened;
      })
      .finally(() => { if (token === lifecycleToken) opening = null; });
    return opening;
  }

  function close() {
    lifecycleToken += 1;
    if (handle) handle.close();
    handle = null;
    opening = null;
  }

  async function ensureHandle() {
    const opened = await open();
    if (opened.closed) throw new PersistenceError('idb-closed', 'The persistence connection is closed.');
    return opened;
  }
  const recovery = createRecoveryRepository({ ensureHandle, nowIso: () => nowIso(now), libraryHardCapBytes, policyContext: repositoryPolicyContext });

  async function estimateStorage() {
    let persisted = null;
    if (storageManager && typeof storageManager.persisted === 'function') {
      try { persisted = Boolean(await storageManager.persisted()); } catch { persisted = null; }
    }
    if (!storageManager || typeof storageManager.estimate !== 'function') {
      return { availableBytes: null, usage: null, quota: null, persisted, status: 'unavailable' };
    }
    try {
      const estimate = await storageManager.estimate();
      const usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
      const quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
      const availableBytes = usage !== null && quota !== null
        ? Math.max(0, quota - usage - quotaSafetyReserveBytes) : null;
      return { availableBytes, usage, quota, persisted, status: 'available' };
    } catch (error) {
      return { availableBytes: null, usage: null, quota: null, persisted, status: 'error', error: normalizeIdbError(error, 'storage-estimate-failed') };
    }
  }

  async function requestPersist() {
    if (!storageManager || typeof storageManager.persist !== 'function') {
      return { status: 'unavailable', granted: false, persisted: null };
    }
    try {
      const granted = Boolean(await storageManager.persist());
      let persisted = null;
      if (typeof storageManager.persisted === 'function') {
        try { persisted = Boolean(await storageManager.persisted()); } catch { persisted = null; }
      }
      return { status: granted ? 'granted' : 'not-granted', granted, persisted };
    } catch (error) {
      return { status: 'error', granted: false, persisted: null, error: normalizeIdbError(error, 'storage-persist-failed') };
    }
  }

  async function save(snapshot) {
    snapshot = ownSaveSnapshot(snapshot);
    assertSnapshot(snapshot, repositoryPolicyContext);
    const opened = await ensureHandle();
    const estimate = await estimateStorage();
    const mapId = snapshot.mapId === null ? mapIdFactory() : snapshot.mapId;
    if (!isPersistentId(mapId, 'map_')) throw new PersistenceError('invalid-map-id', 'Persistent map ID is invalid.');
    const timestamp = nowIso(now);
    const tx = opened.transaction([STORE_MAPS, STORE_DOCUMENTS, STORE_ATTACHMENTS, STORE_META, STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS], 'readwrite');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const maps = tx.objectStore(STORE_MAPS);
      const documents = tx.objectStore(STORE_DOCUMENTS);
      const attachmentsStore = tx.objectStore(STORE_ATTACHMENTS);
      const meta = tx.objectStore(STORE_META);
      const mapRequest = requestToPromise(maps.get(mapId));
      const docRequest = requestToPromise(documents.get(mapId));
      const allAttachmentRowsRequest = requestToPromise(attachmentsStore.getAll());
      const recoveryAttachmentRowsRequest = requestToPromise(tx.objectStore(STORE_RECOVERY_ATTACHMENTS).getAll());
      const allMapsRequest = requestToPromise(maps.getAll());
      const usageRequest = requestToPromise(meta.get(META_LIBRARY_USAGE));
      const [existingMap, existingDoc, allAttachmentRows, allMaps, usageRecord, recoveryAttachmentRows] = await Promise.all([
        mapRequest, docRequest, allAttachmentRowsRequest, allMapsRequest, usageRequest, recoveryAttachmentRowsRequest
      ]);
      for (const map of allMaps) {
        const mapError = validateMapMetadata(map);
        if (mapError) throw new PersistenceError('invalid-map-record', mapError);
      }
      const actual = summarizeAttachmentRows(allAttachmentRows || []);
      const existingAttachmentRows = (allAttachmentRows || []).filter((row) => row.mapId === mapId);
      let recoveryStoredBytes = 0;
      for (const row of recoveryAttachmentRows || []) {
        const recoveryError = validateRecoveryAttachmentRecord(row);
        if (recoveryError) throw new PersistenceError('recovery-usage-corrupt', 'Stored recovery attachment record is invalid: ' + recoveryError);
        recoveryStoredBytes += row.sizeBytes;
      }
      if (existingMap) {
        const mapError = validateMapMetadata(existingMap);
        if (mapError) throw new PersistenceError('invalid-map-record', mapError);
        if (snapshot.mapId === null) throw new PersistenceError('map-id-collision', 'Generated map ID already exists.');
        if (!Number.isSafeInteger(snapshot.expectedGeneration) || snapshot.expectedGeneration !== existingMap.generation) {
          throw new PersistenceError('stale-generation', 'The saved map changed in another session.');
        }
        assertExistingDocumentCapacity(existingMap, existingDoc, repositoryPolicyContext);
      } else if (snapshot.mapId !== null) {
        throw new PersistenceError('map-missing', 'The saved map no longer exists.');
      }

      const existingById = new Map((existingAttachmentRows || []).map((row) => [row.attachmentId, row]));
      const snapshotById = new Map(snapshot.attachments.map((attachment) => [attachment.persistentId, attachment]));
      const referencedIds = new Set(snapshotById.keys());
      let newMapBytes = 0;
      const puts = [];
      for (const attachment of snapshotById.values()) {
        newMapBytes += attachment.sizeBytes;
        const existing = existingById.get(attachment.persistentId);
        if (!sameBlobMetadata(existing, attachment)) puts.push(attachment);
      }
      if (newMapBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) {
        throw new PersistenceError('attachment-total-limit', 'Saved map attachment limit exceeded.');
      }
      const oldActual = actual.byMap.get(mapId) || { bytes: 0, count: 0 };
      const finalStoredBytes = actual.total - oldActual.bytes + newMapBytes;
      const combinedStoredBytes = finalStoredBytes + recoveryStoredBytes;
      if (combinedStoredBytes > libraryHardCapBytes) {
        throw new PersistenceError('library-limit', 'Combined legacy and recovery attachment storage is at application capacity.');
      }
      const reconciled = reconcileMapSummaries(allMaps || [], actual.byMap);
      const reconciledTargetIndex = reconciled.records.findIndex((map) => map.mapId === mapId);
      if (reconciledTargetIndex >= 0) {
        reconciled.records[reconciledTargetIndex] = {
          ...reconciled.records[reconciledTargetIndex],
          attachmentBytes: newMapBytes,
          storedAttachmentCount: referencedIds.size
        };
      }
      const usageRepaired = !usageRecord
        || !Number.isSafeInteger(usageRecord.storedAttachmentBytes)
        || usageRecord.storedAttachmentBytes !== actual.total
        || reconciled.changed;
      const bytesOfPuts = puts.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
      const quotaWarning = estimate.availableBytes !== null
        && estimate.availableBytes < bytesOfPuts + 256 * 1024;

      const generation = existingMap ? existingMap.generation + 1 : 1;
      const mapRecord = {
        schemaVersion: SCHEMA_VERSION,
        mapId,
        name: snapshot.tree.name,
        createdAt: existingMap?.createdAt || timestamp,
        modifiedAt: timestamp,
        savedAt: timestamp,
        generation,
        nodeCount: snapshot.nodeCount,
        attachmentBytes: newMapBytes,
        storedAttachmentCount: referencedIds.size
      };
      const mapError = validateMapMetadata(mapRecord);
      if (mapError) throw new PersistenceError('invalid-map-record', mapError);
      const documentRecord = {
        schemaVersion: SCHEMA_VERSION,
        mapId,
        generation,
        savedAt: timestamp,
        tree: snapshot.tree,
        attachmentRefs: attachmentRefsFromSnapshot(snapshot)
      };
      const documentError = validateDocumentRecord(documentRecord);
      if (documentError) throw new PersistenceError('invalid-document-record', documentError);

      for (const attachment of puts) {
        const record = {
          mapId,
          attachmentId: attachment.persistentId,
          blob: attachment.blob,
          originalName: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
          mime: attachment.mime,
          classification: attachment.classification,
          sha256: null
        };
        const recordError = validateAttachmentRecord(record);
        if (recordError) throw new PersistenceError('invalid-attachment-record', recordError);
        attachmentsStore.put(record);
      }
      for (const row of existingAttachmentRows || []) {
        if (!referencedIds.has(row.attachmentId)) attachmentsStore.delete([mapId, row.attachmentId]);
      }
      documents.put(documentRecord);
      for (const reconciledMap of reconciled.records) {
        if (reconciledMap.mapId !== mapId) maps.put(reconciledMap);
      }
      maps.put(mapRecord);
      meta.put({ key: META_LIBRARY_USAGE, storedAttachmentBytes: finalStoredBytes, updatedAt: timestamp });
      meta.put({ key: META_RECOVERY_USAGE, storedAttachmentBytes: recoveryStoredBytes, updatedAt: timestamp });
      meta.put({ key: META_SCHEMA, schemaVersion: SCHEMA_VERSION });
      await done;
      return {
        ok: true,
        mapId,
        generation,
        savedRevision: snapshot.capturedRevision,
        mapping: snapshot.mapping,
        map: mapRecord,
        libraryBytes: finalStoredBytes,
        wroteAttachmentBytes: bytesOfPuts,
        wroteAttachmentCount: puts.length,
        skippedAttachmentCount: referencedIds.size - puts.length,
        usageRepaired,
        quotaWarning,
        estimate
      };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw normalizeIdbError(error, 'save-failed');
    }
  }

  async function load(mapId) {
    if (!isPersistentId(mapId, 'map_')) throw new PersistenceError('invalid-map-id', 'Persistent map ID is invalid.');
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_MAPS, STORE_DOCUMENTS, STORE_ATTACHMENTS], 'readonly');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const maps = tx.objectStore(STORE_MAPS);
      const documents = tx.objectStore(STORE_DOCUMENTS);
      const attachments = tx.objectStore(STORE_ATTACHMENTS);
      const [mapRecord, documentRecord, rows] = await Promise.all([
        requestToPromise(maps.get(mapId)),
        requestToPromise(documents.get(mapId)),
        requestToPromise(attachments.index('by_mapId').getAll(mapId))
      ]);
      await done;
      if (!mapRecord && !documentRecord) throw new PersistenceError('map-missing', 'Saved map not found.');
      if (!mapRecord || !documentRecord) throw new PersistenceError('record-inconsistent', 'Saved map metadata or document is missing.');
      const mapError = validateMapMetadata(mapRecord);
      if (mapError) throw new PersistenceError('invalid-map-record', mapError);
      const documentError = validateDocumentRecord(documentRecord);
      if (documentError) throw new PersistenceError('invalid-document-record', documentError);
      if (documentRecord.mapId !== mapId) throw new PersistenceError('identity-inconsistent', 'Saved document identity does not match the requested map.');
      if (mapRecord.generation !== documentRecord.generation) {
        throw new PersistenceError('generation-inconsistent', 'Saved map metadata and document generations differ.');
      }
      const nodeLimit = resolveSavedMapNodeLimit(undefined, repositoryPolicyContext);
      if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
      if (mapRecord.nodeCount > nodeLimit.limit) throw new PersistenceError('node-limit', 'Saved map exceeds the node limit.');
      try {
        loadTree(documentRecord.tree, { limits: { maxNodes: nodeLimit.limit } });
      } catch (error) {
        throw new PersistenceError('invalid-tree', `Saved tree is invalid: ${String(error?.message || error)}`, { cause: error });
      }
      let actualNodeCount = 0;
      const countNode = (node) => { actualNodeCount += 1; for (const child of node?.children || []) countNode(child); };
      countNode(documentRecord.tree);
      if (actualNodeCount !== mapRecord.nodeCount) throw new PersistenceError('node-count-inconsistent', 'Saved map node count is inconsistent.');
      if (mapRecord.name !== documentRecord.tree.name) throw new PersistenceError('name-inconsistent', 'Saved map name and tree root name differ.');
      const refById = new Map();
      for (const ref of documentRecord.attachmentRefs) {
        if (refById.has(ref.attachmentId)) throw new PersistenceError('duplicate-reference', 'Saved map has duplicate attachment references.');
        if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0 || ref.sizeBytes > MAX_ATTACHMENT_BYTES) {
          throw new PersistenceError('invalid-reference', 'Saved attachment reference size is invalid.');
        }
        refById.set(ref.attachmentId, ref);
      }
      const rowById = new Map();
      for (const row of rows || []) {
        const rowError = validateAttachmentRecord(row);
        if (rowError) throw new PersistenceError('invalid-attachment-record', rowError);
        if (row.mapId !== mapId) throw new PersistenceError('invalid-attachment-record', 'Attachment belongs to a different map.');
        rowById.set(row.attachmentId, row);
      }
      const treeRefs = new Set();
      const visit = (node, path) => {
        if (Object.prototype.hasOwnProperty.call(node?.data || {}, 'attachmentId') && typeof node.data.attachmentId !== 'string') {
          throw new PersistenceError('invalid-attachment-id', `${path} attachmentId must be a string.`);
        }
        if (node?.data?.classification !== undefined && node.data.classification !== null) {
          const classificationError = validateClassificationValue(node.data.classification);
          if (classificationError) throw new PersistenceError('invalid-classification', `${path} classification is invalid: ${classificationError}`);
        }
        if (typeof node?.data?.attachmentId === 'string') {
          const attachmentId = node.data.attachmentId;
          const ref = refById.get(attachmentId);
          if (!ref) throw new PersistenceError('missing-reference', `${path} references an attachment with no document reference.`);
          if (typeof node.data.originalName !== 'string' || node.data.originalName !== ref.originalName) {
            throw new PersistenceError('attachment-metadata-mismatch', `${path} originalName does not match its document reference.`);
          }
          if (!Number.isSafeInteger(node.data.sizeBytes) || node.data.sizeBytes !== ref.sizeBytes) {
            throw new PersistenceError('attachment-size-mismatch', `${path} size does not match its document reference.`);
          }
          if (typeof node.data.mime !== 'string' || normalizeAttachmentMime(node.data.mime) !== normalizeAttachmentMime(ref.mime)) {
            throw new PersistenceError('attachment-metadata-mismatch', `${path} mime does not match its document reference.`);
          }
          if (!sameClassification(node.data.classification ?? null, ref.classification ?? null)) {
            throw new PersistenceError('attachment-classification-mismatch', `${path} classification does not match its document reference.`);
          }
          treeRefs.add(attachmentId);
        }
        for (let index = 0; index < (node?.children || []).length; index += 1) visit(node.children[index], `${path}.children[${index}]`);
      };
      visit(documentRecord.tree, 'root');
      for (const attachmentId of treeRefs) if (!refById.has(attachmentId)) throw new PersistenceError('missing-reference', 'Saved tree references an attachment with no document reference.');
      for (const attachmentId of refById.keys()) if (!treeRefs.has(attachmentId)) throw new PersistenceError('unused-reference', 'Saved document has an attachment reference not used by the tree.');
      for (const row of rows || []) if (!refById.has(row.attachmentId)) throw new PersistenceError('unused-attachment-row', 'Saved map has a durable attachment row not referenced by its document.');
      let totalBytes = 0;
      const loadedAttachments = [];
      for (const [attachmentId, ref] of refById) {
        const row = rowById.get(attachmentId);
        if (!row) throw new PersistenceError('attachment-missing', `Saved attachment is missing: ${attachmentId}`);
        if (row.sizeBytes !== ref.sizeBytes || row.blob.size !== ref.sizeBytes) {
          throw new PersistenceError('attachment-size-mismatch', `Saved attachment size does not match: ${attachmentId}`);
        }
        if (row.originalName !== ref.originalName || row.mime !== ref.mime) {
          throw new PersistenceError('attachment-metadata-mismatch', `Saved attachment metadata does not match: ${attachmentId}`);
        }
        if (JSON.stringify(row.classification ?? null) !== JSON.stringify(ref.classification ?? null)) {
          throw new PersistenceError('attachment-classification-mismatch', `Saved attachment classification does not match: ${attachmentId}`);
        }
        totalBytes += row.sizeBytes;
        loadedAttachments.push({
          attachmentId,
          blob: row.blob,
          metadata: {
            attachmentId,
            originalName: row.originalName,
            sizeBytes: row.sizeBytes,
            mime: row.mime,
            classification: row.classification ?? null
          }
        });
      }
      if (totalBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) throw new PersistenceError('attachment-total-limit', 'Saved map attachment total exceeds the limit.');
      if (totalBytes !== mapRecord.attachmentBytes) {
        throw new PersistenceError('usage-inconsistent', 'Saved map attachment-byte accounting is inconsistent.');
      }
      if (loadedAttachments.length !== mapRecord.storedAttachmentCount) {
        throw new PersistenceError('usage-inconsistent', 'Saved map attachment count is inconsistent.');
      }
      return { map: mapRecord, document: documentRecord, attachments: loadedAttachments };
    } catch (error) {
      throw normalizeIdbError(error, 'load-failed');
    }
  }

  async function list() {
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_MAPS], 'readonly');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const maps = await requestToPromise(tx.objectStore(STORE_MAPS).getAll());
      await done;
      return (maps || []).map((map) => {
        const error = validateMapMetadata(map);
        if (error) throw new PersistenceError('invalid-map-record', error);
        return {
          mapId: map.mapId,
          name: map.name,
          createdAt: map.createdAt,
          modifiedAt: map.modifiedAt,
          savedAt: map.savedAt,
          generation: map.generation,
          nodeCount: map.nodeCount,
          attachmentBytes: map.attachmentBytes,
          storedAttachmentCount: map.storedAttachmentCount
        };
      }).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    } catch (error) {
      throw normalizeIdbError(error, 'list-failed');
    }
  }

  async function remove(mapId, { expectedGeneration = null } = {}) {
    if (!isPersistentId(mapId, 'map_')) throw new PersistenceError('invalid-map-id', 'Persistent map ID is invalid.');
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_MAPS, STORE_DOCUMENTS, STORE_ATTACHMENTS, STORE_META], 'readwrite');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const maps = tx.objectStore(STORE_MAPS);
      const documents = tx.objectStore(STORE_DOCUMENTS);
      const attachments = tx.objectStore(STORE_ATTACHMENTS);
      const meta = tx.objectStore(STORE_META);
      const [mapRecord, allAttachmentRows, allMaps, usageRecord] = await Promise.all([
        requestToPromise(maps.get(mapId)),
        requestToPromise(attachments.getAll()),
        requestToPromise(maps.getAll()),
        requestToPromise(meta.get(META_LIBRARY_USAGE))
      ]);
      for (const map of allMaps) {
        const mapError = validateMapMetadata(map);
        if (mapError) throw new PersistenceError('invalid-map-record', mapError);
      }
      if (!mapRecord) throw new PersistenceError('map-missing', 'Saved map no longer exists.');
      const removeLimit = resolveSavedMapNodeLimit(undefined, repositoryPolicyContext);
      if (!removeLimit.ok) throw new PersistenceError(removeLimit.reason, removeLimit.message);
      if (mapRecord.nodeCount > removeLimit.limit) throw new PersistenceError('node-limit', 'Saved map exceeds the node limit.');
      if (expectedGeneration !== null && expectedGeneration !== mapRecord.generation) {
        throw new PersistenceError('stale-generation', 'The saved map changed in another session.');
      }
      const actual = summarizeAttachmentRows(allAttachmentRows || []);
      const targetActual = actual.byMap.get(mapId) || { bytes: 0, count: 0 };
      const remainingActualByMap = new Map(actual.byMap);
      remainingActualByMap.delete(mapId);
      const remainingBytes = actual.total - targetActual.bytes;
      const rows = (allAttachmentRows || []).filter((row) => row.mapId === mapId);
      for (const row of rows) attachments.delete([mapId, row.attachmentId]);
      documents.delete(mapId);
      maps.delete(mapId);
      const remaining = allMaps.filter((map) => map.mapId !== mapId);
      const reconciled = reconcileMapSummaries(remaining, remainingActualByMap);
      for (const map of reconciled.records) maps.put(map);
      const usageRepaired = !usageRecord
        || !Number.isSafeInteger(usageRecord.storedAttachmentBytes)
        || usageRecord.storedAttachmentBytes !== actual.total
        || reconciled.changed;
      meta.put({ key: META_LIBRARY_USAGE, storedAttachmentBytes: remainingBytes, updatedAt: nowIso(now) });
      await done;
      return { ok: true, mapId, libraryBytes: remainingBytes, usageRepaired, removedAttachments: rows.length };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw normalizeIdbError(error, 'delete-failed');
    }
  }

  async function repairUsage() {
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_MAPS, STORE_ATTACHMENTS, STORE_META, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS], 'readwrite');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const maps = tx.objectStore(STORE_MAPS);
      const attachments = tx.objectStore(STORE_ATTACHMENTS);
      const meta = tx.objectStore(STORE_META);
      const [mapRows, attachmentRows, recoveryRows] = await Promise.all([
        requestToPromise(maps.getAll()),
        requestToPromise(attachments.getAll()),
        requestToPromise(tx.objectStore(STORE_RECOVERY_ATTACHMENTS).getAll())
      ]);
      const actual = summarizeAttachmentRows(attachmentRows || []);
      let recoveryBytes = 0;
      for (const row of recoveryRows || []) { const recoveryError = validateRecoveryAttachmentRecord(row); if (recoveryError) throw new PersistenceError('recovery-usage-corrupt', 'Stored recovery attachment record is invalid: ' + recoveryError); recoveryBytes += row.sizeBytes; }
      for (const map of mapRows || []) {
        const mapError = validateMapMetadata(map);
        if (mapError) throw new PersistenceError('invalid-map-record', mapError);
      }
      const reconciled = reconcileMapSummaries(mapRows || [], actual.byMap);
      for (const map of reconciled.records) maps.put(map);
      meta.put({ key: META_LIBRARY_USAGE, storedAttachmentBytes: actual.total, updatedAt: nowIso(now) });
      meta.put({ key: META_RECOVERY_USAGE, storedAttachmentBytes: recoveryBytes, updatedAt: nowIso(now) });
      meta.put({ key: META_SCHEMA, schemaVersion: SCHEMA_VERSION });
      await done;
      return { ok: true, libraryBytes: actual.total, repairedMaps: reconciled.records.length };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw normalizeIdbError(error, 'repair-failed');
    }
  }

  async function usage() {
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_META], 'readonly');
    const done = transactionDone(tx);
    done.catch(() => {});
    try {
      const record = await requestToPromise(tx.objectStore(STORE_META).get(META_LIBRARY_USAGE));
      await done;
      const estimate = await estimateStorage();
      return { storedAttachmentBytes: record?.storedAttachmentBytes ?? 0, updatedAt: record?.updatedAt ?? null, libraryHardCapBytes, estimate };
    } catch (error) {
      throw normalizeIdbError(error, 'usage-failed');
    }
  }

  async function combinedUsage() { return recovery.combinedUsage(); }
  return {
    open,
    close,
    save,
    load,
    list,
    remove,
    repairUsage,
    usage,
    combinedUsage,
    createRecoveryWorkspace: recovery.createWorkspace,
    loadRecoveryWorkspace: recovery.loadWorkspace,
    saveRecoveryCheckpoint: recovery.saveCheckpoint,
    loadRecoveryCheckpoint: recovery.loadCheckpoint,
    listRecoveryCandidates: recovery.listCandidates,
    beginRecoverySave: recovery.beginSave,
    abandonRecoverySave: recovery.abandonSave,
    retireRecoveryThrough: recovery.retireThrough,
    claimRecoverySource: recovery.claimSource,
    releaseRecoveryClaim: recovery.releaseClaim,
    supersedeRecoverySource: recovery.supersedeSource,
    discardRecoveryWorkspace: recovery.discardWorkspace,
    estimate: estimateStorage,
    requestPersist,
    get closed() { return !handle || handle.closed; }
  };
}






















