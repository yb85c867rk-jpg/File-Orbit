export {
  DB_NAME, DB_VERSION, SCHEMA_VERSION, STORE_MAPS, STORE_DOCUMENTS, STORE_ATTACHMENTS,
  STORE_SETTINGS, STORE_META, META_LIBRARY_USAGE, META_SCHEMA,
  STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS, META_RECOVERY_USAGE, RECOVERY_SCHEMA_VERSION,
  MAX_SAVED_MAP_NODES, MAX_SAVED_MAP_ATTACHMENT_BYTES, MAX_SAVED_ATTACHMENT_BYTES,
  APPLICATION_LIBRARY_HARD_CAP_BYTES, QUOTA_SAFETY_RESERVE_BYTES,
  PersistenceError, persistenceError
} from './schema.js';
export { createMapId, createAttachmentId, isPersistentId, assertMapId, assertAttachmentId,
  createRecoveryWorkspaceId, createRecoveryWorkspaceToken, createRecoveryCheckpointId, createRecoverySaveId, createRecoveryClaimId,
  isRecoveryWorkspaceId, isRecoveryWorkspaceToken, isRecoveryCheckpointId, isRecoverySaveId, isRecoveryClaimId } from './ids.js';
export { buildSaveSnapshot, attachmentRefsFromSnapshot, ownSaveSnapshot, snapshotPolicyContext, attachSnapshotPolicyContext } from './codec.js';
export { buildRecoverySnapshot, materializeRecoverySnapshot, ownValidatedRecoverySnapshot, assertRecoverySnapshot } from './recovery-codec.js';
export { validateRecoveryWorkspace, validateRecoveryCheckpoint, validateRecoveryAttachmentRecord } from './recovery-schema.js';
export { createRecoveryScheduler } from './recovery-scheduler.js';
export { openPersistenceDatabase, deletePersistenceDatabase, normalizeIdbError } from './idb.js';
export { createPersistenceRepository } from './repository.js';
export { createRestoredAttachmentRegistry, admitSavedMapRuntime, reconstructSavedMapRuntime, loadSavedMapRuntime } from './runtime.js';







