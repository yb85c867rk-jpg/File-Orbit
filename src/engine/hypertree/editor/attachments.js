import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from './attachment-classification.js';

/** Session-local attachment registry. File/Blob objects never enter data. */
export function createAttachmentRegistry({
  datasetToken,
  maxFileBytes = MAX_ATTACHMENT_BYTES,
  maxTotalBytes = MAX_ATTACHMENT_TOTAL_BYTES,
  counter = 0
} = {}) {
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) throw new Error('datasetToken must be a nonnegative safe integer');
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) throw new Error('maxFileBytes must be positive');
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes <= 0) throw new Error('maxTotalBytes must be positive');
  let nextCounter = counter;
  let totalBytes = 0;
  const records = new Map();
  const retained = new Map();
  let retentionCounter = 0;
  function nextId() {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      if (!Number.isSafeInteger(nextCounter)) return null;
      const id = `att-${datasetToken.toString(36)}-${nextCounter.toString(36)}`;
      nextCounter += 1;
      if (!records.has(id)) return id;
    }
    return null;
  }
  function reserve(file) {
    if (!file || typeof file !== 'object') return { ok: false, reason: 'attachment-missing', message: 'Choose a file.' };
    const sizeBytes = Number(file.size);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return { ok: false, reason: 'attachment-size-invalid', message: 'The selected file has no valid size.' };
    if (sizeBytes > maxFileBytes) return { ok: false, reason: 'attachment-too-large', message: `Files must be at most ${maxFileBytes} bytes.` };
    if (totalBytes + sizeBytes > maxTotalBytes) return { ok: false, reason: 'attachment-total-limit', message: `Session attachments are limited to ${maxTotalBytes} bytes.` };
    const classification = null;
    const id = nextId();
    if (!id) return { ok: false, reason: 'attachment-id-exhausted', message: 'No attachment reference is available.' };
    const name = typeof file.name === 'string' && file.name.length > 0 ? file.name : 'attachment';
    const mime = typeof file.type === 'string' ? file.type : '';
    const record = {
      id, file, name, sizeBytes, mime, classification,
      committed: false,
      metadata: Object.freeze({
        attachmentId: id,
        originalName: name,
        sizeBytes,
        mime,
        classification
      })
    };
    records.set(id, record);
    totalBytes += sizeBytes;
    return { ok: true, id, record, metadata: record.metadata };
  }
  function setClassification(id, classification) {
    const record = records.get(id);
    if (!record) return false;
    if (!classification || typeof classification !== 'object' || typeof classification.format !== 'string') return false;
    record.classification = classification;
    record.metadata = Object.freeze({ ...record.metadata, classification });
    return true;
  }
  function stage(file, classification) {
    const reserved = reserve(file);
    if (!reserved.ok) return reserved;
    if (!setClassification(reserved.id, classification)) {
      release(reserved.id);
      return { ok: false, reason: 'attachment-classification-missing', message: 'The file format has not been classified.' };
    }
    return { ok: true, id: reserved.id, record: records.get(reserved.id), metadata: records.get(reserved.id).metadata };
  }
  /**
   * Adopt an attachment restored from durable storage under a fixed ID.
   * Explicit metadata is required because a Blob has no File.name.
   */
  function adopt({ attachmentId, file, metadata } = {}) {
    if (typeof attachmentId !== 'string' || attachmentId.length === 0) {
      return { ok: false, reason: 'attachment-id-invalid', message: 'A persistent attachment ID is required.' };
    }
    if (records.has(attachmentId)) {
      return { ok: false, reason: 'attachment-id-collision', message: 'An attachment with that ID is already registered.' };
    }
    if (!file || typeof file !== 'object' || typeof file.slice !== 'function') {
      return { ok: false, reason: 'attachment-missing', message: 'A Blob or File is required.' };
    }
    const sizeBytes = Number(file.size);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return { ok: false, reason: 'attachment-size-invalid', message: 'The attachment has no valid size.' };
    }
    if (sizeBytes > maxFileBytes) return { ok: false, reason: 'attachment-too-large', message: `Files must be at most ${maxFileBytes} bytes.` };
    if (totalBytes + sizeBytes > maxTotalBytes) return { ok: false, reason: 'attachment-total-limit', message: `Session attachments are limited to ${maxTotalBytes} bytes.` };
    if (!metadata || typeof metadata !== 'object') {
      return { ok: false, reason: 'attachment-metadata-missing', message: 'Saved attachment metadata is required.' };
    }
    if (metadata.attachmentId !== attachmentId) {
      return { ok: false, reason: 'attachment-metadata-mismatch', message: 'Saved attachment ID does not match the requested ID.' };
    }
    if (Number(metadata.sizeBytes) !== sizeBytes) {
      return { ok: false, reason: 'attachment-size-mismatch', message: 'Saved attachment size does not match the Blob.' };
    }
    const name = typeof metadata.originalName === 'string' && metadata.originalName.length > 0 ? metadata.originalName : null;
    if (!name) return { ok: false, reason: 'attachment-metadata-invalid', message: 'Saved originalName is required.' };
    const mime = typeof metadata.mime === 'string' ? metadata.mime : '';
    const classification = metadata.classification === undefined ? null : metadata.classification;
    if (classification !== null && (typeof classification !== 'object' || typeof classification.format !== 'string')) {
      return { ok: false, reason: 'attachment-metadata-invalid', message: 'Saved classification is invalid.' };
    }
    const record = {
      id: attachmentId, file, name, sizeBytes, mime, classification,
      committed: true,
      metadata: Object.freeze({ attachmentId, originalName: name, sizeBytes, mime, classification })
    };
    records.set(attachmentId, record);
    totalBytes += sizeBytes;
    return { ok: true, id: attachmentId, record, metadata: record.metadata };
  }
  function commit(id) {
    const record = records.get(id);
    if (!record) return false;
    record.committed = true;
    return true;
  }
  function retain(id, leaseId = null) {
    if (!records.has(id)) return null;
    const token = typeof leaseId === 'string' && leaseId.length > 0 ? leaseId : 'retention-' + String(++retentionCounter);
    const existing = retained.get(token);
    if (existing !== undefined) return existing === id ? token : null;
    retained.set(token, id);
    return token;
  }
  function releaseRetention(leaseId) {
    const id = retained.get(leaseId);
    if (id === undefined) return false;
    retained.delete(leaseId);
    return true;
  }
  function isRetained(id) {
    for (const retainedId of retained.values()) if (retainedId === id) return true;
    return false;
  }
  function release(id) {
    const record = records.get(id);
    if (!record) return false;
    records.delete(id);
    for (const [leaseId, retainedId] of retained) if (retainedId === id) retained.delete(leaseId);
    totalBytes = Math.max(0, totalBytes - record.sizeBytes);
    return true;
  }
  function clear() {
    records.clear();
    retained.clear();
    retentionCounter = 0;
    totalBytes = 0;
    nextCounter = 0;
  }
  return {
    get size() { return records.size; },
    get totalBytes() { return totalBytes; },
    get maxFileBytes() { return maxFileBytes; },
    get maxTotalBytes() { return maxTotalBytes; },
    has(id) { return records.has(id); },
    get(id) { return records.get(id) || null; },
    metadata(id) { const record = records.get(id); return record ? record.metadata : null; },
    snapshot() {
      return [...records.values()].map((record) => ({ ...record.metadata, committed: record.committed }));
    },
    reserve, setClassification, stage, commit, release, clear, adopt, retain, releaseRetention, isRetained
  };
}
export function sweepAttachmentOwnership(registry, { tree = null, entries = [] } = {}) {
  if (!registry) return { released: [] };
  const refs = new Set();
  const collect = (node) => {
    if (typeof node?.data?.attachmentId === 'string') refs.add(node.data.attachmentId);
    for (const child of node?.children || []) collect(child);
  };
  if (tree) collect(tree);
  for (const entry of entries) for (const id of entry?.attachmentRefs || []) refs.add(id);
  const released = [];
  for (const record of registry.snapshot()) {
    if (record.committed && !refs.has(record.attachmentId) && !registry.isRetained?.(record.attachmentId)) {
      if (registry.release(record.attachmentId)) released.push(record.attachmentId);
    }
  }
  return { released };
}


