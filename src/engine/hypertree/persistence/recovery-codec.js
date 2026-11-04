import { attachSnapshotPolicyContext, buildSaveSnapshot, snapshotPolicyContext } from './codec.js';
import { PersistenceError, persistenceError, MAX_SAVED_ATTACHMENT_BYTES, MAX_SAVED_MAP_ATTACHMENT_BYTES } from './schema.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';
import { isPersistentId } from './ids.js';
import { validateRecoveryAttachmentRef } from './recovery-schema.js';
import { loadTree } from '../data/tree-loader.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

async function digest(cryptoApi, bytes) {
  const subtle = cryptoApi?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') throw new PersistenceError('crypto-unavailable', 'SHA-256 is unavailable for recovery snapshots.');
  const hash = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...hash].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function materializeRecoverySnapshot(snapshot, {
  cryptoApi = globalThis.crypto,
  isCancelled = () => false,
  policyContext = snapshotPolicyContext(snapshot)
} = {}) {
  if (!snapshot || !Array.isArray(snapshot.attachments)) throw new PersistenceError('recovery-snapshot-invalid', 'A recovery snapshot is required.');
  const attachments = [];
  for (const attachment of snapshot.attachments) {
    if (isCancelled()) throw new PersistenceError('recovery-cancelled', 'Recovery snapshot preparation was cancelled.');
    let bytes;
    try {
      const blob = attachment.blob;
      bytes = new Uint8Array(await blob.arrayBuffer());
    } catch (error) {
      throw new PersistenceError('recovery-attachment-read-failed', `Recovery attachment ${attachment.originalName || ''} (${attachment.persistentId || ''}) could not be read.`, { cause: error });
    }
    if (isCancelled()) throw new PersistenceError('recovery-cancelled', 'Recovery snapshot preparation was cancelled.');
    const sha256 = await digest(cryptoApi, bytes);
    const blob = new Blob([bytes], { type: String(attachment.mime || '') });
    attachments.push({
      persistentId: attachment.persistentId,
      blob,
      originalName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
      mime: attachment.mime,
      classification: attachment.classification === undefined ? null : clone(attachment.classification),
      sha256
    });
  }
  const attachmentRefs = attachments.map((attachment) => ({
    attachmentId: attachment.persistentId,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    mime: attachment.mime,
    classification: attachment.classification,
    sha256: attachment.sha256
  }));
  const materialized = {
    ...snapshot,
    workspaceId: snapshot.workspaceId,
    tree: clone(snapshot.tree),
    mapping: new Map(snapshot.mapping),
    attachments: Object.freeze(attachments.map((attachment) => Object.freeze(attachment))),
    attachmentRefs: Object.freeze(attachmentRefs.map((ref) => Object.freeze(ref))),
    attachmentCount: attachments.length,
    totalAttachmentBytes: snapshot.totalAttachmentBytes,
    nodeCount: snapshot.nodeCount
  };
  return policyContext ? attachSnapshotPolicyContext(materialized, policyContext) : Object.freeze(materialized);
}

export async function buildRecoverySnapshot({
  tree,
  registry,
  mapping = new Map(),
  datasetToken,
  capturedRevision,
  workspaceId = null,
  allocateAttachmentId,
  limits = {},
  policyContext = undefined,
  cryptoApi = globalThis.crypto,
  isCancelled = () => false
} = {}) {
  if (isCancelled()) throw new PersistenceError('recovery-cancelled', 'Recovery snapshot preparation was cancelled.');
  const snapshot = buildSaveSnapshot({
    tree,
    registry,
    mapping,
    mapId: null,
    expectedGeneration: null,
    datasetToken,
    capturedRevision,
    allocateAttachmentId,
    limits,
    policyContext
  });
  return materializeRecoverySnapshot({ ...snapshot, workspaceId }, { cryptoApi, isCancelled, policyContext: snapshotPolicyContext(snapshot) });
}

export function assertRecoverySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw persistenceError('recovery-snapshot-invalid', 'A recovery snapshot is required.');
  if (!Array.isArray(snapshot.attachments) || !Array.isArray(snapshot.attachmentRefs)) throw persistenceError('recovery-snapshot-invalid', 'Recovery snapshot attachments are required.');
  if (!snapshot.tree || typeof snapshot.tree !== 'object') throw persistenceError('recovery-snapshot-invalid', 'Recovery snapshot tree is required.');
  if (!Number.isSafeInteger(snapshot.nodeCount) || snapshot.nodeCount < 1) throw persistenceError('recovery-snapshot-invalid', 'Recovery snapshot node count is invalid.');
  if (!Number.isSafeInteger(snapshot.totalAttachmentBytes) || snapshot.totalAttachmentBytes < 0) throw persistenceError('recovery-snapshot-invalid', 'Recovery snapshot attachment bytes are invalid.');
  if (snapshot.attachmentCount !== snapshot.attachments.length) throw persistenceError('recovery-snapshot-invalid', 'Recovery snapshot attachment count is inconsistent.');
  return snapshot;
}
function classificationEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function collectTreeAttachments(tree) {
  const refs = new Map();
  let nodes = 0;
  const visit = (node) => {
    if (!node || (node.kind !== 'folder' && node.kind !== 'file')) throw new PersistenceError('recovery-tree-invalid', 'Recovery tree node kind is invalid.');
    nodes += 1;
    const data = node.data || {};
    if (typeof data.attachmentId === 'string') {
      const meta = { originalName: data.originalName, sizeBytes: data.sizeBytes, mime: data.mime, classification: data.classification ?? null };
      const previous = refs.get(data.attachmentId);
      if (previous && !classificationEqual(previous, meta) || previous && (previous.originalName !== meta.originalName || previous.sizeBytes !== meta.sizeBytes || previous.mime !== meta.mime)) throw new PersistenceError('recovery-attachment-mismatch', 'Recovery tree has inconsistent attachment metadata.');
      refs.set(data.attachmentId, meta);
    }
    for (const child of node.children || []) visit(child);
  };
  visit(tree);
  return { refs, nodes };
}

/**
 * Own and validate the proposed payload before any IndexedDB transaction.
 * Hashes are computed here, outside a live transaction, and the returned
 * snapshot contains only detached bytes and frozen metadata.
 */
export async function ownValidatedRecoverySnapshot(snapshot, { cryptoApi = globalThis.crypto, isCancelled = () => false, policyContext = undefined } = {}) {
  assertRecoverySnapshot(snapshot);
  if (isCancelled()) throw new PersistenceError('recovery-cancelled', 'Recovery snapshot preparation was cancelled.');
  const inheritedContext = policyContext === undefined ? snapshotPolicyContext(snapshot) : policyContext;
  const nodeLimit = resolveSavedMapNodeLimit(undefined, inheritedContext);
  if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
  const tree = clone(snapshot.tree);
  let structuralGraph;
  try { structuralGraph = loadTree(tree); }
  catch (error) { throw new PersistenceError('recovery-tree-invalid', 'Recovery tree is invalid: ' + String(error?.message || error), { cause: error }); }
  const collected = collectTreeAttachments(tree);
  if (collected.nodes !== snapshot.nodeCount || structuralGraph.graph.nodes.size !== snapshot.nodeCount) throw new PersistenceError('recovery-node-count-mismatch', 'Recovery node count does not match the tree.');
  // Capacity is a context decision, not structural corruption.
  if (collected.nodes > nodeLimit.limit) throw new PersistenceError('node-limit', 'Recovery node limit exceeded.');
  if (!Array.isArray(snapshot.attachmentRefs)) throw new PersistenceError('recovery-snapshot-invalid', 'Recovery attachmentRefs are required.');
  const refs = new Map();
  for (const ref of snapshot.attachmentRefs) {
    const refError = validateRecoveryAttachmentRef(ref);
    if (refError) throw new PersistenceError('recovery-attachment-invalid', refError);
    if (refs.has(ref.attachmentId)) throw new PersistenceError('recovery-attachment-duplicate', 'Recovery attachmentRefs contain duplicate IDs.');
    refs.set(ref.attachmentId, { ...ref, classification: clone(ref.classification ?? null) });
  }
  const records = new Map();
  const mapping = new Map(snapshot.mapping || []);
  const sourceAttachments = snapshot.attachments.map((attachment) => ({ ...attachment, classification: clone(attachment.classification ?? null) }));
  for (const attachment of sourceAttachments) {
    if (!isPersistentId(attachment?.persistentId, 'att_')) throw new PersistenceError('recovery-attachment-invalid', 'Recovery attachment ID is invalid.');
    if (records.has(attachment.persistentId)) throw new PersistenceError('recovery-attachment-duplicate', 'Recovery attachments contain duplicate IDs.');
    if (!attachment.blob || typeof attachment.blob.arrayBuffer !== 'function') throw new PersistenceError('recovery-attachment-invalid', 'Recovery attachment payload is missing.');
    let bytes;
    try { bytes = new Uint8Array(await attachment.blob.arrayBuffer()); }
    catch (error) { throw new PersistenceError('recovery-attachment-read-failed', `Recovery attachment ${attachment.originalName || ''} (${attachment.persistentId}) could not be read.`, { cause: error }); }
    if (isCancelled()) throw new PersistenceError('recovery-cancelled', 'Recovery snapshot preparation was cancelled.');
    if (bytes.byteLength !== attachment.sizeBytes) throw new PersistenceError('recovery-attachment-size-mismatch', 'Recovery attachment size does not match its bytes.');
    if (bytes.byteLength > MAX_SAVED_ATTACHMENT_BYTES) throw new PersistenceError('attachment-too-large', 'Recovery attachment exceeds the per-file limit.');
    const sha256 = await digest(cryptoApi, bytes);
    if (attachment.sha256 && String(attachment.sha256).toLowerCase() !== sha256) throw new PersistenceError('recovery-hash-mismatch', 'Recovery attachment digest does not match its stored digest.');
    const ref = refs.get(attachment.persistentId);
    if (!ref) throw new PersistenceError('recovery-attachment-unreferenced', 'Recovery attachment has no reference.');
    if (ref.originalName !== attachment.originalName || ref.sizeBytes !== bytes.byteLength || ref.mime !== attachment.mime || !classificationEqual(ref.classification, attachment.classification ?? null)) throw new PersistenceError('recovery-attachment-mismatch', 'Recovery attachment metadata does not match its reference.');
    if (sha256 !== String(ref.sha256).toLowerCase()) throw new PersistenceError('recovery-hash-mismatch', 'Recovery attachment digest does not match its reference.');
    records.set(attachment.persistentId, {
      persistentId: attachment.persistentId,
      blob: new Blob([bytes], { type: String(attachment.mime || '') }),
      originalName: ref.originalName,
      sizeBytes: bytes.byteLength,
      mime: ref.mime,
      classification: clone(ref.classification ?? null),
      sha256
    });
  }
  if (records.size !== refs.size) throw new PersistenceError('recovery-attachment-missing', 'Recovery attachment payloads do not match attachmentRefs.');
  if (refs.size !== collected.refs.size) throw new PersistenceError('recovery-attachment-missing', 'Recovery tree references do not match attachmentRefs.');
  for (const [id, ref] of refs) {
    if (!records.has(id)) throw new PersistenceError('recovery-attachment-missing', 'Recovery attachment payload is missing.');
    const treeRef = collected.refs.get(id);
    if (!treeRef) throw new PersistenceError('recovery-attachment-unreferenced', 'Recovery attachment is not referenced by the tree.');
    if (treeRef.originalName !== ref.originalName || treeRef.sizeBytes !== ref.sizeBytes || treeRef.mime !== ref.mime || !classificationEqual(treeRef.classification, ref.classification)) throw new PersistenceError('recovery-attachment-mismatch', 'Recovery tree and attachmentRef metadata differ.');
  }
  let total = 0;
  for (const record of records.values()) total += record.sizeBytes;
  if (total > MAX_SAVED_MAP_ATTACHMENT_BYTES) throw new PersistenceError('attachment-total-limit', 'Recovery attachment total exceeds the per-workspace limit.');
  if (snapshot.attachmentCount !== records.size) throw new PersistenceError('recovery-attachment-count-mismatch', 'Recovery attachment count does not match payloads.');
  if (snapshot.totalAttachmentBytes !== total) throw new PersistenceError('recovery-attachment-total-mismatch', 'Recovery attachment total does not match payloads.');
  if (snapshot.nodeCount !== collected.nodes) throw new PersistenceError('recovery-node-count-mismatch', 'Recovery node count does not match the tree.');
  const owned = {
    workspaceId: snapshot.workspaceId,
    capturedRevision: snapshot.capturedRevision,
    datasetToken: snapshot.datasetToken,
    tree,
    nodeCount: collected.nodes,
    attachments: Object.freeze([...records.values()]),
    attachmentRefs: Object.freeze([...refs.values()]),
    attachmentCount: records.size,
    totalAttachmentBytes: total,
    mapping
  };
  return attachSnapshotPolicyContext(owned, nodeLimit.context);
}


