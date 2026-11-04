import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../editor/attachment-classification.js';

export const DB_NAME = 'fileorbit';
export const DB_VERSION = 2;
export const STORE_MAPS = 'maps';
export const STORE_DOCUMENTS = 'mapDocuments';
export const STORE_ATTACHMENTS = 'mapAttachments';
export const STORE_SETTINGS = 'settings';
export const STORE_META = 'meta';

export const SCHEMA_VERSION = 1;
export { MAX_SAVED_MAP_NODES } from './node-limit.js';
export const MAX_SAVED_MAP_ATTACHMENT_BYTES = MAX_ATTACHMENT_TOTAL_BYTES;
export const MAX_SAVED_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES;
export const APPLICATION_LIBRARY_HARD_CAP_BYTES = 512 * 1024 * 1024;
export const QUOTA_SAFETY_RESERVE_BYTES = 16 * 1024 * 1024;
export const META_LIBRARY_USAGE = 'libraryUsage';
export const META_SCHEMA = 'schema';

export const STORE_RECOVERY_WORKSPACES = 'recoveryWorkspaces';
export const STORE_RECOVERY_CHECKPOINTS = 'recoveryCheckpoints';

export const STORE_RECOVERY_ATTACHMENTS = 'recoveryAttachments';
export const META_RECOVERY_USAGE = 'recoveryUsage';

export const RECOVERY_SCHEMA_VERSION = 1;
export class PersistenceError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'PersistenceError';
    this.code = code;
    this.cause = options.cause ?? null;
    this.details = options.details ?? null;
  }
}

export function persistenceError(code, message, options) {
  return new PersistenceError(code, message, options);
}

export function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export const CLASSIFICATION_FIELDS = Object.freeze([
  'format', 'badge', 'needsReview', 'confidence', 'reason', 'extension', 'mime', 'classifier'
]);

export function normalizeAttachmentMime(value) {
  if (typeof value !== 'string') return '';
  return value.split(';')[0].trim().toLowerCase();
}

export function validateClassificationValue(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainRecord(value)) return 'classification must be a plain object';
  for (const key of Object.keys(value)) {
    if (!CLASSIFICATION_FIELDS.includes(key)) return `unknown classification field: ${key}`;
  }
  if (typeof value.format !== 'string' || value.format.length === 0) return 'classification.format is required';
  if (typeof value.badge !== 'string') return 'classification.badge must be a string';
  if (typeof value.needsReview !== 'boolean') return 'classification.needsReview must be boolean';
  for (const key of ['confidence', 'reason', 'classifier']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return `classification.${key} must be a string`;
  }
  if (value.extension !== undefined && value.extension !== null && typeof value.extension !== 'string') return 'classification.extension must be a string or null';
  if (value.mime !== undefined && value.mime !== null && typeof value.mime !== 'string') return 'classification.mime must be a string or null';
  return null;
}

export function classificationSemanticKey(value) {
  const error = validateClassificationValue(value);
  if (error) return { error };
  if (value === null || value === undefined) return { key: 'null' };
  const normalized = {};
  for (const field of CLASSIFICATION_FIELDS) normalized[field] = value[field] === undefined ? null : value[field];
  return { key: JSON.stringify(normalized) };
}

export function sameClassification(left, right) {
  const a = classificationSemanticKey(left);
  const b = classificationSemanticKey(right);
  if (a.error || b.error) return false;
  return a.key === b.key;
}

export function validateAttachmentReferenceMetadata(ref) {
  if (!isPlainRecord(ref)) return 'attachment reference must be a plain object';
  if (typeof ref.attachmentId !== 'string' || ref.attachmentId.length === 0) return 'attachment reference id is required';
  if (typeof ref.originalName !== 'string' || ref.originalName.length === 0) return 'attachment originalName is required';
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0) return 'attachment reference size is invalid';
  if (ref.sizeBytes > MAX_ATTACHMENT_BYTES) return 'attachment reference exceeds per-file limit';
  if (typeof ref.mime !== 'string') return 'attachment reference mime is invalid';
  return validateClassificationValue(ref.classification);
}

export function validateMapMetadata(record) {
  if (!isPlainRecord(record)) return 'map metadata must be a plain object';
  if (record.schemaVersion !== SCHEMA_VERSION) return 'unsupported map schema version';
  if (typeof record.mapId !== 'string' || record.mapId.length === 0) return 'mapId is required';
  if (typeof record.name !== 'string' || record.name.length === 0) return 'map name is required';
  if (!Number.isSafeInteger(record.generation) || record.generation < 1) return 'generation must be a positive integer';
  if (!Number.isSafeInteger(record.nodeCount) || record.nodeCount < 1) return 'nodeCount must be a positive integer';
  if (!Number.isSafeInteger(record.attachmentBytes) || record.attachmentBytes < 0) return 'attachmentBytes must be nonnegative';
  if (!Number.isSafeInteger(record.storedAttachmentCount) || record.storedAttachmentCount < 0) return 'storedAttachmentCount must be nonnegative';
  for (const key of ['createdAt', 'modifiedAt', 'savedAt']) {
    if (typeof record[key] !== 'string' || Number.isNaN(Date.parse(record[key]))) return `${key} must be an ISO date string`;
  }
  return null;
}

export function validateDocumentRecord(record) {
  if (!isPlainRecord(record)) return 'document must be a plain object';
  if (record.schemaVersion !== SCHEMA_VERSION) return 'unsupported document schema version';
  if (typeof record.mapId !== 'string' || record.mapId.length === 0) return 'document mapId is required';
  if (!Number.isSafeInteger(record.generation) || record.generation < 1) return 'document generation must be positive';
  if (!record.tree || typeof record.tree !== 'object') return 'document tree is required';
  if (!Array.isArray(record.attachmentRefs)) return 'document attachmentRefs must be an array';
  for (const ref of record.attachmentRefs) {
    const refError = validateAttachmentReferenceMetadata(ref);
    if (refError) return refError;
  }
  return null;
}

export function validateAttachmentRecord(record) {
  if (!isPlainRecord(record)) return 'attachment record must be a plain object';
  if (typeof record.mapId !== 'string' || record.mapId.length === 0) return 'attachment mapId is required';
  if (typeof record.attachmentId !== 'string' || record.attachmentId.length === 0) return 'attachmentId is required';
  if (!record.blob || typeof record.blob !== 'object' || typeof record.blob.size !== 'number') return 'attachment blob is required';
  if (!Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 0) return 'attachment size is invalid';
  if (record.blob.size !== record.sizeBytes) return 'attachment Blob size does not match declared size';
  if (typeof record.originalName !== 'string' || record.originalName.length === 0) return 'attachment originalName is required';
  if (typeof record.mime !== 'string') return 'attachment mime is required';
  return validateClassificationValue(record.classification);
}

