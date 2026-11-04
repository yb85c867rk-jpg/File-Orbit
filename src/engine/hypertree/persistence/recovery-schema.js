import {
  RECOVERY_SCHEMA_VERSION,
  MAX_SAVED_ATTACHMENT_BYTES,
  MAX_SAVED_MAP_ATTACHMENT_BYTES,
  MAX_SAVED_MAP_NODES,
  isPlainRecord,
  validateClassificationValue
} from './schema.js';
import {
  isRecoveryCheckpointId,
  isRecoveryClaimId,
  isRecoverySaveId,
  isRecoveryWorkspaceId,
  isRecoveryWorkspaceToken
} from './ids.js';

const ISO = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;

export function validateRecoveryWorkspace(record) {
  if (!isPlainRecord(record)) return 'recovery workspace must be a plain object';
  if (record.recoverySchemaVersion !== RECOVERY_SCHEMA_VERSION) return 'unsupported recovery schema version';
  if (!isRecoveryWorkspaceId(record.workspaceId)) return 'recovery workspaceId is invalid';
  if (!isRecoveryWorkspaceToken(record.workspaceToken)) return 'recovery workspaceToken is invalid';
  if (record.state !== 'active' && record.state !== 'superseded' && record.state !== 'discarded') return 'recovery workspace state is invalid';
  if (!ISO(record.createdAt) || !ISO(record.updatedAt)) return 'recovery timestamps are invalid';
  if (!integer(record.nextSequence, 1)) return 'recovery nextSequence is invalid';
  if (!integer(record.controlVersion, 1)) return 'recovery controlVersion is invalid';
  if (record.activeCheckpointGeneration !== null && !integer(record.activeCheckpointGeneration, 1)) return 'recovery active generation is invalid';
  if (!integer(record.retiredThroughSequence, 0)) return 'recovery retired sequence is invalid';
  if (record.retiredThroughSequence >= record.nextSequence) return 'recovery retired sequence must be older than nextSequence';
  if (record.activeCheckpointGeneration !== null && record.activeCheckpointGeneration >= record.nextSequence) return 'recovery active generation is invalid';
  if (record.pendingSave !== null) {
    const pending = record.pendingSave;
    if (!isPlainRecord(pending) || !isRecoverySaveId(pending.saveId) || !integer(pending.sequence, 1) || !ISO(pending.issuedAt)) return 'recovery pendingSave is invalid';
  }
  if (record.documentName !== null && typeof record.documentName !== 'string') return 'recovery documentName is invalid';
  if (typeof record.origin !== 'string') return 'recovery origin is invalid';
  if (record.sourceMapId !== null && typeof record.sourceMapId !== 'string') return 'recovery sourceMapId is invalid';
  for (const key of ['lastSaveStarted', 'lastSaveCompleted']) {
    const save = record[key];
    if (save === null) continue;
    if (!isPlainRecord(save) || !isRecoverySaveId(save.saveId) || !integer(save.sequence, 1) || !ISO(key === 'lastSaveStarted' ? save.startedAt : save.completedAt)) return `recovery ${key} is invalid`;
  }
  if (record.forkedFrom !== null) {
    const source = record.forkedFrom;
    if (!isPlainRecord(source) || !isRecoveryWorkspaceId(source.workspaceId) || !isRecoveryWorkspaceToken(source.workspaceToken) || !isRecoveryCheckpointId(source.checkpointId) || !integer(source.checkpointGeneration, 1)) return 'recovery forkedFrom is invalid';
  }
  if (record.claim !== null) {
    const claim = record.claim;
    if (!isPlainRecord(claim) || !isRecoveryClaimId(claim.claimId) || !isRecoveryCheckpointId(claim.checkpointId) || !integer(claim.checkpointGeneration, 1) || !ISO(claim.claimedAt) || !ISO(claim.expiresAt)) return 'recovery claim is invalid';
  }
  if (record.supersededBy !== null) {
    const source = record.supersededBy;
    if (!isPlainRecord(source) || !isRecoveryWorkspaceId(source.workspaceId) || (source.checkpointGeneration !== null && !integer(source.checkpointGeneration, 1))) return 'recovery supersededBy is invalid';
  }
  if (record.discardedAt !== null && !ISO(record.discardedAt)) return 'recovery discardedAt is invalid';
  return null;
}

export function validateRecoveryCheckpoint(record) {
  if (!isPlainRecord(record)) return 'recovery checkpoint must be a plain object';
  if (record.recoverySchemaVersion !== RECOVERY_SCHEMA_VERSION) return 'unsupported recovery checkpoint version';
  if (!isRecoveryWorkspaceId(record.workspaceId)) return 'recovery checkpoint workspaceId is invalid';
  if (!isRecoveryWorkspaceToken(record.workspaceToken)) return 'recovery checkpoint workspaceToken is invalid';
  if (!isRecoveryCheckpointId(record.checkpointId)) return 'recovery checkpointId is invalid';
  if (!integer(record.checkpointGeneration, 1)) return 'recovery checkpoint generation is invalid';
  if (!integer(record.capturedRevision, 0)) return 'recovery captured revision is invalid';
  if (!record.tree || typeof record.tree !== 'object') return 'recovery tree is required';
  if (!integer(record.nodeCount, 1)) return 'recovery node count is invalid';
  if (!Array.isArray(record.attachmentRefs)) return 'recovery attachmentRefs are invalid';
  if (!integer(record.attachmentCount, 0)) return 'recovery attachmentCount is invalid';
  if (!integer(record.attachmentBytes, 0) || record.attachmentBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) return 'recovery attachment bytes are invalid';
  if (record.attachmentCount !== record.attachmentRefs.length) return 'recovery attachment count is inconsistent';
  const ids = new Set();
  for (const ref of record.attachmentRefs) {
    const error = validateRecoveryAttachmentRef(ref);
    if (error) return error;
    if (ids.has(ref.attachmentId)) return 'recovery checkpoint has duplicate attachment references';
    ids.add(ref.attachmentId);
  }
  if (record.state !== 'complete') return 'recovery checkpoint is not complete';
  if (!ISO(record.createdAt) || !ISO(record.updatedAt)) return 'recovery checkpoint timestamps are invalid';
  return null;
}

export function validateRecoveryAttachmentRef(ref) {
  if (!isPlainRecord(ref)) return 'recovery attachment reference must be a plain object';
  if (typeof ref.attachmentId !== 'string' || !ref.attachmentId.startsWith('att_')) return 'recovery attachment id is invalid';
  if (typeof ref.originalName !== 'string' || ref.originalName.length === 0) return 'recovery originalName is invalid';
  if (!integer(ref.sizeBytes, 0) || ref.sizeBytes > MAX_SAVED_ATTACHMENT_BYTES) return 'recovery attachment size is invalid';
  if (typeof ref.mime !== 'string') return 'recovery mime is invalid';
  if (typeof ref.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(ref.sha256)) return 'recovery sha256 is invalid';
  return validateClassificationValue(ref.classification);
}

export function validateRecoveryAttachmentRecord(record) {
  if (!isPlainRecord(record)) return 'recovery attachment record must be a plain object';
  if (!isRecoveryWorkspaceId(record.workspaceId)) return 'recovery attachment workspaceId is invalid';
  if (!integer(record.checkpointGeneration, 1)) return 'recovery attachment generation is invalid';
  const refError = validateRecoveryAttachmentRef(record);
  if (refError) return refError;
  if (!record.blob || typeof record.blob !== 'object' || typeof record.blob.size !== 'number') return 'recovery attachment blob is required';
  if (record.blob.size !== record.sizeBytes) return 'recovery attachment blob size does not match';
  return null;
}


