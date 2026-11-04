import { loadTree } from '../data/tree-loader.js';
import { cloneMetadata } from '../data/metadata.js';
import { validateName } from '../editor/validation.js';
import { createAttachmentId, isPersistentId, assertMapId } from './ids.js';
import {
  MAX_SAVED_ATTACHMENT_BYTES, MAX_SAVED_MAP_ATTACHMENT_BYTES,
  PersistenceError, isPlainRecord, SCHEMA_VERSION,
  normalizeAttachmentMime, sameClassification, validateClassificationValue
} from './schema.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';

const NODE_FIELDS = new Set(['id', 'name', 'kind', 'data', 'children']);
const SNAPSHOT_POLICY_CONTEXT = Symbol('fileorbit.snapshot.policyContext');

function attachSnapshotContext(snapshot, context) {
  Object.defineProperty(snapshot, SNAPSHOT_POLICY_CONTEXT, { value: context, enumerable: false, configurable: false, writable: false });
  return Object.freeze(snapshot);
}

export function attachSnapshotPolicyContext(snapshot, context) { return attachSnapshotContext(snapshot, context); }

export function snapshotPolicyContext(snapshot) {
  return snapshot && typeof snapshot === 'object' ? snapshot[SNAPSHOT_POLICY_CONTEXT] ?? null : null;
}

function fail(code, message, details = null) {
  throw new PersistenceError(code, message, { details });
}

function cloneData(value, path) {
  if (value === undefined) return Object.create(null);
  if (!isPlainRecord(value)) fail('invalid-node-data', `${path}.data must be a plain object`);
  return cloneMetadata(value, undefined, path);
}

function validateClassification(value, path) {
  const error = validateClassificationValue(value);
  if (error) fail('invalid-classification', `${path}.classification: ${error}`);
  return value ?? null;
}

function attachmentMetadataForNode(data, record, path) {
  if (!record || !record.file || typeof record.file.slice !== 'function') {
    fail('attachment-missing-live', `${path} references an attachment that is not available in the runtime registry`);
  }
  const size = Number(record.sizeBytes ?? record.file.size);
  if (!Number.isSafeInteger(size) || size < 0) fail('attachment-size-invalid', `${path} attachment has an invalid size`);
  if (size > MAX_SAVED_ATTACHMENT_BYTES) fail('attachment-too-large', `${path} attachment exceeds the per-file limit`);
  if (record.file.size !== size) fail('attachment-size-mismatch', `${path} attachment Blob size does not match registry metadata`);
  const dataClassification = validateClassification(data.classification ?? null, path);
  const recordClassification = validateClassification(record.metadata?.classification ?? null, path);
  if (dataClassification && recordClassification && !sameClassification(dataClassification, recordClassification)) {
    fail('attachment-classification-mismatch', `${path} classification does not match the runtime attachment registry`);
  }
  const classification = dataClassification || recordClassification;
  const originalName = typeof data.originalName === 'string' ? data.originalName : record.metadata?.originalName;
  if (typeof originalName !== 'string' || originalName.length === 0) fail('attachment-metadata-invalid', `${path} is missing originalName`);
  if (typeof record.metadata?.originalName === 'string' && data.originalName !== undefined && data.originalName !== record.metadata.originalName) {
    fail('attachment-metadata-mismatch', `${path} originalName does not match the runtime attachment registry`);
  }
  const mime = typeof data.mime === 'string' ? data.mime : (record.metadata?.mime ?? '');
  if (typeof record.metadata?.mime === 'string' && normalizeAttachmentMime(data.mime) !== normalizeAttachmentMime(record.metadata.mime)) {
    fail('attachment-metadata-mismatch', `${path} mime does not match the runtime attachment registry`);
  }
  if (typeof data.sizeBytes !== 'undefined' && data.sizeBytes !== size) {
    fail('attachment-size-mismatch', `${path} declared size does not match the runtime attachment`);
  }
  return { originalName, sizeBytes: size, mime, classification };
}

/**
 * Build a save proposal without mutating the live tree, graph, registry,
 * history, or the caller-owned mapping.
 */
export function buildSaveSnapshot({
  tree,
  registry,
  mapping = new Map(),
  mapId = null,
  expectedGeneration = null,
  datasetToken,
  capturedRevision,
  allocateAttachmentId = createAttachmentId,
  limits = {},
  policyContext = undefined
} = {}) {
  if (!tree || typeof tree !== 'object') fail('tree-required', 'A committed tree is required.');
  if (!registry || typeof registry.get !== 'function') fail('registry-required', 'The runtime attachment registry is required.');
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) fail('dataset-invalid', 'A runtime dataset token is required.');
  if (!Number.isSafeInteger(capturedRevision) || capturedRevision < 0) fail('revision-invalid', 'A runtime revision is required.');
  if (mapId !== null) assertMapId(mapId);
  if (mapId === null && expectedGeneration !== null && expectedGeneration !== undefined) {
    fail('generation-invalid', 'A new map cannot have an expected durable generation.');
  }
  if (mapId !== null && (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)) {
    fail('generation-invalid', 'An existing map requires a positive expected generation.');
  }
  if (!(mapping instanceof Map)) fail('mapping-invalid', 'Attachment mapping must be a Map.');
  if (typeof allocateAttachmentId !== 'function') fail('id-allocator-invalid', 'An attachment ID allocator is required.');
  const nodeLimit = resolveSavedMapNodeLimit(limits.maxNodes, policyContext);
  if (!nodeLimit.ok) fail(nodeLimit.reason, nodeLimit.message);
  const maxNodes = nodeLimit.limit;
  const resolvedPolicyContext = nodeLimit.context;

  const proposedMapping = new Map(mapping);
  const seenPersistentIds = new Set(proposedMapping.values());
  if (seenPersistentIds.size !== proposedMapping.size) fail('mapping-collision', 'Attachment mapping contains duplicate persistent IDs.');
  for (const [runtimeId, persistentId] of proposedMapping) {
    if (typeof runtimeId !== 'string' || runtimeId.length === 0) fail('mapping-invalid', 'Runtime attachment ID is invalid.');
    if (!isPersistentId(persistentId, 'att_')) fail('mapping-invalid', `Persistent attachment ID is invalid: ${persistentId}`);
  }

  const attachments = new Map();
  const referencedNodeCounts = new Map();
  const seenNodeIds = new Set();
  let nodeCount = 0;

  const persistentIdFor = (runtimeId, path) => {
    if (proposedMapping.has(runtimeId)) return proposedMapping.get(runtimeId);
    let persistentId = null;
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const candidate = allocateAttachmentId();
      if (!isPersistentId(candidate, 'att_')) fail('id-allocator-invalid', 'Allocated attachment ID is invalid.');
      if (!seenPersistentIds.has(candidate)) { persistentId = candidate; break; }
    }
    if (!persistentId) fail('attachment-id-exhausted', 'No persistent attachment ID is available.');
    proposedMapping.set(runtimeId, persistentId);
    seenPersistentIds.add(persistentId);
    return persistentId;
  };

  const walk = (node, path) => {
    if (!isPlainRecord(node)) fail('invalid-node', `${path} must be a plain object`);
    for (const key of Object.keys(node)) if (!NODE_FIELDS.has(key)) fail('unknown-field', `${path}.${key} is not a permitted tree field`);
    if (typeof node.id !== 'string' || node.id.length === 0) fail('invalid-id', `${path}.id must be a non-empty string`);
    if (seenNodeIds.has(node.id)) fail('duplicate-id', `${path}.id duplicates node ${node.id}`);
    seenNodeIds.add(node.id);
    if (typeof node.name !== 'string') fail('invalid-name', `${path}.name must be a string`);
    const checkedName = validateName(node.name);
    if (!checkedName.ok || checkedName.name !== node.name) fail('invalid-name', `${path}.name is not an accepted name`);
    if (node.kind !== 'folder' && node.kind !== 'file') fail('invalid-kind', `${path}.kind must be folder or file`);
    nodeCount += 1;
    if (nodeCount > maxNodes) fail('node-limit', `Saved maps are limited to ${maxNodes} nodes.`);

    const data = cloneData(node.data, path);
    if (typeof data.attachmentId === 'string') {
      const runtimeId = data.attachmentId;
      const persistentId = persistentIdFor(runtimeId, path);
      const record = registry.get(runtimeId);
      const metadata = attachmentMetadataForNode(data, record, path);
      const key = persistentId;
      const existingAttachment = attachments.get(key);
      if (existingAttachment && (existingAttachment.sizeBytes !== metadata.sizeBytes
          || existingAttachment.originalName !== metadata.originalName
          || existingAttachment.mime !== metadata.mime)) {
        fail('attachment-identity-collision', `${path} maps multiple live attachments with different metadata to ${persistentId}`);
      }
      if (!existingAttachment) {
        attachments.set(key, {
          sessionId: runtimeId,
          persistentId,
          blob: record.file,
          originalName: metadata.originalName,
          sizeBytes: metadata.sizeBytes,
          mime: metadata.mime,
          classification: metadata.classification ? cloneMetadata(metadata.classification, undefined, `${path}.classification`) : null
        });
      }
      referencedNodeCounts.set(persistentId, (referencedNodeCounts.get(persistentId) || 0) + 1);
      data.attachmentId = persistentId;
      data.originalName = metadata.originalName;
      data.sizeBytes = metadata.sizeBytes;
      data.mime = metadata.mime;
      if (metadata.classification) data.classification = cloneMetadata(metadata.classification, undefined, `${path}.classification`);
    }

    const persisted = { id: node.id, name: node.name, kind: node.kind, data };
    if (node.kind === 'folder') {
      const children = node.children === undefined ? [] : node.children;
      if (!Array.isArray(children)) fail('invalid-children', `${path}.children must be an array`);
      persisted.children = children.map((child, index) => walk(child, `${path}.children[${index}]`));
    } else if (Array.isArray(node.children) && node.children.length > 0) {
      fail('file-children', `${path} file nodes cannot have children`);
    }
    return persisted;
  };

  const persistedTree = walk(tree, 'root');
  let totalAttachmentBytes = 0;
  for (const attachment of attachments.values()) totalAttachmentBytes += attachment.sizeBytes;
  if (totalAttachmentBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) {
    fail('attachment-total-limit', `Saved maps are limited to ${MAX_SAVED_MAP_ATTACHMENT_BYTES} attachment bytes.`);
  }
  try {
    loadTree(persistedTree, { limits: { ...limits, maxNodes } });
  } catch (error) {
    throw new PersistenceError('invalid-tree', `Persisted tree is invalid: ${String(error?.message || error)}`, { cause: error });
  }

  return attachSnapshotContext({
    schemaVersion: SCHEMA_VERSION,
    mapId,
    expectedGeneration: mapId === null ? null : expectedGeneration,
    capturedRevision,
    datasetToken,
    tree: persistedTree,
    mapping: proposedMapping,
    attachments: [...attachments.values()],
    referencedAttachmentIds: [...attachments.keys()],
    totalAttachmentBytes,
    nodeCount
  }, resolvedPolicyContext);
}

export function attachmentRefsFromSnapshot(snapshot) {
  return snapshot.attachments.map((attachment) => ({
    attachmentId: attachment.persistentId,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    mime: attachment.mime,
    classification: attachment.classification
  }));
}
/**
 * Validate a snapshot again at the repository boundary and copy it into an
 * owned payload. This prevents caller mutation after snapshot construction or
 * while async save preparation is pending from changing what is written.
 */
export function ownSaveSnapshot(snapshot, { policyContext = undefined } = {}) {
  if (!snapshot || typeof snapshot !== 'object') fail('snapshot-required', 'A save snapshot is required.');
  const inheritedContext = policyContext === undefined ? snapshotPolicyContext(snapshot) : policyContext;
  const nodeLimit = resolveSavedMapNodeLimit(undefined, inheritedContext);
  if (!nodeLimit.ok) fail(nodeLimit.reason, nodeLimit.message);
  const maxNodes = nodeLimit.limit;
  const resolvedPolicyContext = nodeLimit.context;
  if (!Number.isSafeInteger(snapshot.capturedRevision) || snapshot.capturedRevision < 0) fail('snapshot-invalid', 'Captured revision is invalid.');
  if (!Number.isSafeInteger(snapshot.datasetToken) || snapshot.datasetToken < 0) fail('snapshot-invalid', 'Runtime dataset token is invalid.');
  if (snapshot.mapId !== null) assertMapId(snapshot.mapId);
  if (snapshot.mapId !== null && (!Number.isSafeInteger(snapshot.expectedGeneration) || snapshot.expectedGeneration < 1)) {
    fail('snapshot-invalid', 'Expected generation is required for an existing map.');
  }
  if (snapshot.mapId === null && snapshot.expectedGeneration !== null && snapshot.expectedGeneration !== undefined) {
    fail('snapshot-invalid', 'A new map cannot have an expected generation.');
  }
  if (!(snapshot.mapping instanceof Map)) fail('snapshot-invalid', 'Snapshot mapping must be a Map.');
  const mapping = new Map(snapshot.mapping);
  const seenPersistent = new Set();
  for (const [runtimeId, persistentId] of mapping) {
    if (typeof runtimeId !== 'string' || !isPersistentId(persistentId, 'att_') || seenPersistent.has(persistentId)) {
      fail('snapshot-invalid', 'Snapshot mapping contains invalid or duplicate IDs.');
    }
    seenPersistent.add(persistentId);
  }
  const attachments = new Map();
  for (const attachment of Array.isArray(snapshot.attachments) ? snapshot.attachments : []) {
    if (!isPlainRecord(attachment)) fail('snapshot-invalid', 'Attachment payload must be a plain object.');
    if (!isPersistentId(attachment.persistentId, 'att_')) fail('snapshot-invalid', 'Attachment persistent ID is invalid.');
    if (attachments.has(attachment.persistentId)) fail('snapshot-invalid', 'Snapshot has duplicate attachment payloads.');
    if (!attachment.blob || typeof attachment.blob.slice !== 'function') fail('attachment-missing-live', 'Attachment payload Blob is missing.');
    if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes < 0 || attachment.blob.size !== attachment.sizeBytes) {
      fail('snapshot-invalid', 'Attachment payload size is invalid.');
    }
    if (attachment.sizeBytes > MAX_SAVED_ATTACHMENT_BYTES) fail('attachment-too-large', 'Attachment payload exceeds the per-file limit.');
    if (typeof attachment.originalName !== 'string' || attachment.originalName.length === 0) fail('attachment-metadata-invalid', 'Attachment payload originalName is invalid.');
    if (typeof attachment.mime !== 'string') fail('attachment-metadata-invalid', 'Attachment payload mime is invalid.');
    const classification = validateClassification(attachment.classification ?? null, 'attachment');
    attachments.set(attachment.persistentId, {
      ...attachment,
      classification: classification ? cloneMetadata(classification, undefined, 'attachment.classification') : null
    });
  }
  const referenced = new Set();
  const seenIds = new Set();
  let nodeCount = 0;
  let totalBytes = 0;
  const walk = (node, path) => {
    if (!isPlainRecord(node)) fail('invalid-node', `${path} must be a plain object`);
    for (const key of Object.keys(node)) if (!NODE_FIELDS.has(key)) fail('unknown-field', `${path}.${key} is not a permitted tree field`);
    if (typeof node.id !== 'string' || node.id.length === 0) fail('invalid-id', `${path}.id is invalid`);
    if (seenIds.has(node.id)) fail('duplicate-id', `${path}.id duplicates ${node.id}`);
    seenIds.add(node.id);
    if (typeof node.name !== 'string') fail('invalid-name', `${path}.name is invalid`);
    const checkedName = validateName(node.name);
    if (!checkedName.ok || checkedName.name !== node.name) fail('invalid-name', `${path}.name is not accepted`);
    if (node.kind !== 'folder' && node.kind !== 'file') fail('invalid-kind', `${path}.kind is invalid`);
    nodeCount += 1;
    if (nodeCount > maxNodes) fail('node-limit', `Saved maps are limited to ${maxNodes} nodes.`);
    const data = cloneData(node.data, path);
    if (typeof data.attachmentId === 'string') {
      if (!isPersistentId(data.attachmentId, 'att_')) fail('invalid-attachment-id', `${path} attachment ID is invalid.`);
      const payload = attachments.get(data.attachmentId);
      if (!payload) fail('missing-attachment-payload', `${path} references an attachment with no payload.`);
      if (data.originalName !== payload.originalName) fail('attachment-metadata-mismatch', `${path} originalName does not match its payload.`);
      if (data.sizeBytes !== payload.sizeBytes) fail('attachment-size-mismatch', `${path} size does not match its payload.`);
      if (normalizeAttachmentMime(data.mime) !== normalizeAttachmentMime(payload.mime)) fail('attachment-metadata-mismatch', `${path} mime does not match its payload.`);
      if (!sameClassification(data.classification ?? null, payload.classification ?? null)) {
        fail('attachment-classification-mismatch', `${path} classification does not match its payload.`);
      }
      referenced.add(data.attachmentId);
    }
    const copy = { id: node.id, name: node.name, kind: node.kind, data };
    if (node.kind === 'folder') {
      if (node.children !== undefined && !Array.isArray(node.children)) fail('invalid-children', `${path}.children is invalid.`);
      copy.children = (node.children || []).map((child, index) => walk(child, `${path}.children[${index}]`));
    } else if (Array.isArray(node.children) && node.children.length > 0) {
      fail('file-children', `${path} cannot have children.`);
    }
    return copy;
  };
  if (!snapshot.tree || typeof snapshot.tree !== 'object') fail('snapshot-invalid', 'Snapshot tree is required.');
  const tree = walk(snapshot.tree, 'root');
  if (!Number.isSafeInteger(snapshot.nodeCount) || snapshot.nodeCount !== nodeCount) fail('node-count-mismatch', 'Declared snapshot node count does not match the tree.');
  for (const attachment of attachments.values()) totalBytes += attachment.sizeBytes;
  if (totalBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) fail('attachment-total-limit', 'Snapshot attachment payload exceeds the per-map limit.');
  for (const attachmentId of attachments.keys()) if (!referenced.has(attachmentId)) fail('unused-attachment-payload', `Attachment payload is not referenced by the tree: ${attachmentId}`);
  try {
    loadTree(tree, { limits: { maxNodes } });
  } catch (error) {
    throw new PersistenceError('invalid-tree', `Snapshot tree is invalid: ${String(error?.message || error)}`, { cause: error });
  }
  return attachSnapshotContext({
    schemaVersion: SCHEMA_VERSION,
    mapId: snapshot.mapId,
    expectedGeneration: snapshot.mapId === null ? null : snapshot.expectedGeneration,
    capturedRevision: snapshot.capturedRevision,
    datasetToken: snapshot.datasetToken,
    tree,
    mapping,
    attachments: [...attachments.values()],
    referencedAttachmentIds: [...referenced],
    totalAttachmentBytes: totalBytes,
    nodeCount
  }, resolvedPolicyContext);
}


