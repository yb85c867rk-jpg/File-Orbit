import {
  APPLICATION_LIBRARY_HARD_CAP_BYTES,
  MAX_SAVED_ATTACHMENT_BYTES,
  MAX_SAVED_MAP_ATTACHMENT_BYTES,
  META_LIBRARY_USAGE,
  META_RECOVERY_USAGE,
  RECOVERY_SCHEMA_VERSION,
  STORE_ATTACHMENTS,
  STORE_META,
  STORE_RECOVERY_ATTACHMENTS,
  STORE_RECOVERY_CHECKPOINTS,
  STORE_RECOVERY_WORKSPACES,
  PersistenceError,
  validateAttachmentRecord
} from './schema.js';
import {
  createRecoveryCheckpointId,
  createRecoveryClaimId,
  createRecoverySaveId,
  createRecoveryWorkspaceId,
  isRecoverySaveId,
  createRecoveryWorkspaceToken,
  isRecoveryCheckpointId,
  isRecoveryClaimId,
  isRecoveryWorkspaceId,
  isRecoveryWorkspaceToken
} from './ids.js';
import { requestToPromise, transactionDone } from './idb.js';
import {
  validateRecoveryAttachmentRecord,
  validateRecoveryCheckpoint,
  validateRecoveryWorkspace
} from './recovery-schema.js';
import { ownValidatedRecoverySnapshot } from './recovery-codec.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';
import { resolvePolicyContext } from '../edition/context.js';
import { loadTree } from '../data/tree-loader.js';

const STORES = [STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS, STORE_ATTACHMENTS, STORE_META];

const iso = (value) => (value instanceof Date ? value : new Date(value)).toISOString();

function sum(rows, predicate = () => true) {
  let total = 0;
  for (const row of rows) if (predicate(row)) total += row.sizeBytes;
  return total;
}

function checkpointIdentityError(workspace, checkpoint, expected = {}) {
  if (!workspace || !checkpoint) return 'recovery checkpoint or workspace is missing';
  if (checkpoint.workspaceId !== workspace.workspaceId) return 'checkpoint workspaceId does not match its workspace control';
  if (checkpoint.workspaceToken !== workspace.workspaceToken) return 'checkpoint workspaceToken does not match its workspace control';
  if (expected.workspaceId && (workspace.workspaceId !== expected.workspaceId || checkpoint.workspaceId !== expected.workspaceId)) return 'checkpoint workspaceId does not match the expected source';
  if (expected.workspaceToken && (workspace.workspaceToken !== expected.workspaceToken || checkpoint.workspaceToken !== expected.workspaceToken)) return 'checkpoint workspaceToken does not match the expected source';
  if (expected.checkpointGeneration && checkpoint.checkpointGeneration !== expected.checkpointGeneration) return 'checkpoint generation does not match the expected source';
  if (expected.checkpointId && checkpoint.checkpointId !== expected.checkpointId) return 'checkpoint ID does not match the expected source';
  return null;
}
function assertCheckpointCapacity(checkpoint, policyContext, label = 'Recovery checkpoint') {
  const checkpointError = validateRecoveryCheckpoint(checkpoint);
  if (checkpointError) throw new PersistenceError('recovery-checkpoint-invalid', checkpointError);
  let loaded;
  try { loaded = loadTree(checkpoint.tree); }
  catch (error) { throw new PersistenceError('recovery-checkpoint-invalid', 'Recovery checkpoint tree is invalid: ' + String(error?.message || error), { cause: error }); }
  const actual = loaded.graph.nodes.size;
  if (actual !== checkpoint.nodeCount) throw new PersistenceError('recovery-node-count-mismatch', 'Recovery checkpoint node count does not match its tree.');
  const nodeLimit = resolveSavedMapNodeLimit(undefined, policyContext);
  if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
  if (actual > nodeLimit.limit) throw new PersistenceError('node-limit', label + ' exceeds this context\'s node limit.');
  return actual;
}
function validateRows(legacyRows, recoveryRows) {
  for (const row of legacyRows) {
    const error = validateAttachmentRecord(row);
    if (error) throw new PersistenceError('usage-corrupt', `Stored legacy attachment record is invalid: ${error}`);
  }
  for (const row of recoveryRows) {
    const error = validateRecoveryAttachmentRecord(row);
    if (error) throw new PersistenceError('recovery-usage-corrupt', `Stored recovery attachment record is invalid: ${error}`);
  }
}

async function readRows(tx) {
  const legacyRows = await requestToPromise(tx.objectStore(STORE_ATTACHMENTS).getAll());
  const recoveryRows = await requestToPromise(tx.objectStore(STORE_RECOVERY_ATTACHMENTS).getAll());
  validateRows(legacyRows || [], recoveryRows || []);
  return { legacyRows: legacyRows || [], recoveryRows: recoveryRows || [] };
}

function writeUsage(meta, libraryBytes, recoveryBytes, nowIsoValue) {
  meta.put({ key: META_LIBRARY_USAGE, storedAttachmentBytes: libraryBytes, updatedAt: nowIsoValue });
  meta.put({ key: META_RECOVERY_USAGE, storedAttachmentBytes: recoveryBytes, updatedAt: nowIsoValue });
}

function combined(libraryBytes, recoveryBytes, hardCapBytes) {
  const totalBytes = libraryBytes + recoveryBytes;
  return { libraryBytes, recoveryBytes, totalBytes, hardCapBytes, withinCap: totalBytes <= hardCapBytes };
}

async function allWorkspaceRows(tx, workspaceId) {
  const checkpoints = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).getAll());
  const attachments = await requestToPromise(tx.objectStore(STORE_RECOVERY_ATTACHMENTS).getAll());
  return {
    checkpoints: (checkpoints || []).filter((row) => row.workspaceId === workspaceId),
    attachments: (attachments || []).filter((row) => row.workspaceId === workspaceId)
  };
}

export function createRecoveryRepository({
  ensureHandle,
  nowIso = () => new Date().toISOString(),
  libraryHardCapBytes = APPLICATION_LIBRARY_HARD_CAP_BYTES,
  policyContext = undefined
} = {}) {
  if (typeof ensureHandle !== 'function') throw new Error('ensureHandle is required');
  const clock = typeof nowIso === 'function' ? nowIso : () => new Date();
  const resolvedPolicy = resolvePolicyContext(policyContext);
  if (!resolvedPolicy.ok) throw new PersistenceError(resolvedPolicy.reason, resolvedPolicy.message);
  const repositoryPolicyContext = resolvedPolicy.context;

  async function createWorkspace({
    workspaceId = createRecoveryWorkspaceId(),
    workspaceToken = createRecoveryWorkspaceToken(),
    forkedFrom = null,
    claimId = null,
    documentName = null,
    origin = 'unknown',
    sourceMapId = null
  } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryWorkspaceToken(workspaceToken)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace identity is invalid.');
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      if (await requestToPromise(workspaces.get(workspaceId))) throw new PersistenceError('recovery-workspace-exists', 'Recovery workspace already exists.');
      let source = null;
      if (forkedFrom) {
        if (!isRecoveryWorkspaceId(forkedFrom.workspaceId) || !isRecoveryWorkspaceToken(forkedFrom.workspaceToken) || !isRecoveryCheckpointId(forkedFrom.checkpointId) || !Number.isSafeInteger(forkedFrom.checkpointGeneration) || forkedFrom.checkpointGeneration < 1) throw new PersistenceError('recovery-fork-invalid', 'Recovery source identity is invalid.');
        if (!isRecoveryClaimId(claimId)) throw new PersistenceError('recovery-claim-required', 'A source claim is required to fork recovery.');
        source = await requestToPromise(workspaces.get(forkedFrom.workspaceId));
        source = await requestToPromise(workspaces.get(forkedFrom.workspaceId));
        const sourceError = validateRecoveryWorkspace(source);
        if (sourceError) throw new PersistenceError('recovery-workspace-invalid', sourceError);
        if (source.state !== 'active') throw new PersistenceError('recovery-source-inactive', 'Recovery source is not active.');
        if (source.activeCheckpointGeneration !== forkedFrom.checkpointGeneration) throw new PersistenceError('recovery-source-advanced', 'Recovery source generation changed.');
        const sourceCheckpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([forkedFrom.workspaceId, forkedFrom.checkpointGeneration]));
        if (!sourceCheckpoint) throw new PersistenceError('recovery-checkpoint-mismatch', 'Recovery source checkpoint is missing.');
        const identityError = checkpointIdentityError(source, sourceCheckpoint, { workspaceId: forkedFrom.workspaceId, workspaceToken: forkedFrom.workspaceToken, checkpointGeneration: forkedFrom.checkpointGeneration, checkpointId: forkedFrom.checkpointId });
        if (identityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', identityError);
        if (!source.claim || source.claim.claimId !== claimId) throw new PersistenceError('recovery-claim-mismatch', 'Recovery source claim does not match.');
        if (source.claim.checkpointGeneration !== forkedFrom.checkpointGeneration || source.claim.checkpointId !== forkedFrom.checkpointId) throw new PersistenceError('recovery-claim-generation-mismatch', 'Recovery claim does not authorize this source generation.');
        if (Date.parse(source.claim.expiresAt) <= Date.parse(timestamp)) throw new PersistenceError('recovery-claim-expired', 'Recovery source claim has expired.');
      }
      const control = {
        recoverySchemaVersion: RECOVERY_SCHEMA_VERSION,
        workspaceId,
        workspaceToken,
        state: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        nextSequence: 1,
        controlVersion: 1,
        activeCheckpointGeneration: null,
        retiredThroughSequence: 0,
        pendingSave: null,
        lastSaveStarted: null,
        lastSaveCompleted: null,
        forkedFrom: forkedFrom ? { workspaceId: forkedFrom.workspaceId, workspaceToken: forkedFrom.workspaceToken, checkpointId: forkedFrom.checkpointId, checkpointGeneration: forkedFrom.checkpointGeneration, claimId } : null,
        claim: null,
        supersededBy: null,
        discardedAt: null,
        documentName: documentName || null,
        origin,
        sourceMapId: sourceMapId || null
      };
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      workspaces.put(control);
      await done;
      return { ok: true, workspace: control };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('recovery-workspace-failed', String(error?.message || error), { cause: error });
    }
  }

  async function loadWorkspace(workspaceId) {
    if (!isRecoveryWorkspaceId(workspaceId)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace ID is invalid.');
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES], 'readonly');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const record = await requestToPromise(tx.objectStore(STORE_RECOVERY_WORKSPACES).get(workspaceId));
      await done;
      if (!record) return null;
      const error = validateRecoveryWorkspace(record);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      return record;
    } catch (error) {
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-load-failed', String(error?.message || error), { cause: error });
    }
  }

  async function saveCheckpoint({
    workspaceId,
    workspaceToken,
    expectedControlVersion,
    checkpointId = createRecoveryCheckpointId(),
    documentName = null,
    origin = 'unknown',
    sourceMapId = null,
    snapshot
  } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryWorkspaceToken(workspaceToken)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace identity is invalid.');
    if (!isRecoveryCheckpointId(checkpointId)) throw new PersistenceError('recovery-checkpoint-invalid', 'Recovery checkpoint ID is invalid.');
    if (!Number.isSafeInteger(expectedControlVersion) || expectedControlVersion < 1) throw new PersistenceError('recovery-control-invalid', 'Expected recovery control version is invalid.');
    snapshot = await ownValidatedRecoverySnapshot(snapshot, { policyContext: repositoryPolicyContext });
    if (snapshot.workspaceId && snapshot.workspaceId !== workspaceId) throw new PersistenceError('recovery-workspace-mismatch', 'Snapshot workspace does not match checkpoint workspace.');
    const nodeLimit = resolveSavedMapNodeLimit(undefined, repositoryPolicyContext);
    if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
    if (snapshot.nodeCount > nodeLimit.limit) throw new PersistenceError('node-limit', 'Recovery node limit exceeded.');
    if (snapshot.totalAttachmentBytes > MAX_SAVED_MAP_ATTACHMENT_BYTES) throw new PersistenceError('attachment-total-limit', 'Recovery attachment total exceeds per-workspace limit.');
    for (const attachment of snapshot.attachments) {
      if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes > MAX_SAVED_ATTACHMENT_BYTES) throw new PersistenceError('attachment-too-large', 'Recovery attachment exceeds per-file limit.');
    }
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const workspaceError = validateRecoveryWorkspace(control);
      if (workspaceError) throw new PersistenceError('recovery-workspace-invalid', workspaceError);
      if (control.workspaceToken !== workspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery workspace token does not match.');
      if (control.state !== 'active') throw new PersistenceError('recovery-tombstoned', 'Recovery workspace is not active.');
      if (control.controlVersion !== expectedControlVersion) throw new PersistenceError('recovery-stale-owner', 'Recovery checkpoint owner is stale.');
      if (control.activeCheckpointGeneration) {
        const existingCheckpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([workspaceId, control.activeCheckpointGeneration]));
        if (!existingCheckpoint) throw new PersistenceError('recovery-checkpoint-missing', 'Active recovery checkpoint is missing.');
        assertCheckpointCapacity(existingCheckpoint, repositoryPolicyContext, 'Existing recovery checkpoint');
      }
      const { legacyRows, recoveryRows } = await readRows(tx);
      const oldWorkspaceRows = recoveryRows.filter((row) => row.workspaceId === workspaceId);
      const oldWorkspaceBytes = sum(oldWorkspaceRows);
      const libraryBytes = sum(legacyRows);
      const recoveryBytes = sum(recoveryRows) - oldWorkspaceBytes + snapshot.totalAttachmentBytes;
      if (recoveryBytes > libraryHardCapBytes || libraryBytes + recoveryBytes > libraryHardCapBytes) throw new PersistenceError('recovery-capacity', 'Combined attachment storage cap would be exceeded.');
      const checkpointGeneration = control.nextSequence;
      const checkpoint = {
        recoverySchemaVersion: RECOVERY_SCHEMA_VERSION,
        workspaceId,
        workspaceToken,
        checkpointId,
        checkpointGeneration,
        capturedRevision: snapshot.capturedRevision,
        documentName: documentName || control.documentName || null,
        origin,
        sourceMapId,
        tree: snapshot.tree,
        nodeCount: snapshot.nodeCount,
        attachmentRefs: snapshot.attachmentRefs,
        attachmentCount: snapshot.attachmentCount,
        attachmentBytes: snapshot.totalAttachmentBytes,
        state: 'complete',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const checkpointError = validateRecoveryCheckpoint(checkpoint);
      if (checkpointError) throw new PersistenceError('recovery-checkpoint-invalid', checkpointError);
      const checkpoints = tx.objectStore(STORE_RECOVERY_CHECKPOINTS);
      for (const old of await requestToPromise(checkpoints.getAll())) {
        if (old.workspaceId === workspaceId) checkpoints.delete([workspaceId, old.checkpointGeneration]);
      }
      const attachments = tx.objectStore(STORE_RECOVERY_ATTACHMENTS);
      for (const old of await requestToPromise(attachments.getAll())) {
        if (old.workspaceId === workspaceId) attachments.delete([workspaceId, old.checkpointGeneration, old.attachmentId]);
      }
      checkpoints.put(checkpoint);
      for (const attachment of snapshot.attachments) {
        const record = {
          workspaceId,
          checkpointGeneration,
          attachmentId: attachment.persistentId,
          blob: attachment.blob,
          originalName: attachment.originalName,
          sizeBytes: attachment.sizeBytes,
          mime: attachment.mime,
          classification: attachment.classification ?? null,
          sha256: attachment.sha256.toLowerCase()
        };
        const rowError = validateRecoveryAttachmentRecord(record);
        if (rowError) throw new PersistenceError('recovery-attachment-invalid', rowError);
        attachments.put(record);
      }
      control.activeCheckpointGeneration = checkpointGeneration;
      control.nextSequence = checkpointGeneration + 1;
      control.controlVersion += 1;
      control.updatedAt = timestamp;
      const controlError = validateRecoveryWorkspace(control);
      if (controlError) throw new PersistenceError('recovery-workspace-invalid', controlError);
      workspaces.put(control);
      writeUsage(tx.objectStore(STORE_META), libraryBytes, recoveryBytes, timestamp);
      await done;
      return { ok: true, workspace: control, checkpoint, mapping: snapshot.mapping, generation: checkpointGeneration, libraryBytes, recoveryBytes, combinedBytes: libraryBytes + recoveryBytes };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError('recovery-save-failed', String(error?.message || error), { cause: error });
    }
  }

  async function loadCheckpoint(workspaceId, checkpointGeneration = null) {
    if (!isRecoveryWorkspaceId(workspaceId)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace ID is invalid.');
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS, STORE_RECOVERY_ATTACHMENTS], 'readonly');
    const done = transactionDone(tx); done.catch(() => {});
    let control; let checkpoint; let rows;
    try {
      control = await requestToPromise(tx.objectStore(STORE_RECOVERY_WORKSPACES).get(workspaceId));
      if (!control) return null;
      const workspaceError = validateRecoveryWorkspace(control);
      if (workspaceError) throw new PersistenceError('recovery-workspace-invalid', workspaceError);
      const generation = checkpointGeneration ?? control.activeCheckpointGeneration;
      if (!generation) return { workspace: control, checkpoint: null, attachments: [] };
      if (control.state !== 'active' || control.activeCheckpointGeneration !== generation) throw new PersistenceError('recovery-checkpoint-inactive', 'Recovery checkpoint is not the active generation.');
      checkpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([workspaceId, generation]));
      if (!checkpoint) throw new PersistenceError('recovery-checkpoint-missing', 'Recovery checkpoint is missing.');
      const identityError = checkpointIdentityError(control, checkpoint, { workspaceId, workspaceToken: control.workspaceToken, checkpointGeneration: generation });
      if (identityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', identityError);
      assertCheckpointCapacity(checkpoint, repositoryPolicyContext);
      rows = (await requestToPromise(tx.objectStore(STORE_RECOVERY_ATTACHMENTS).getAll())).filter((row) => row.workspaceId === workspaceId && row.checkpointGeneration === generation);
      const rowError = rows.map(validateRecoveryAttachmentRecord).find(Boolean);
      const refIds = new Set((checkpoint.attachmentRefs || []).map((ref) => ref.attachmentId));
      const rowIds = new Set(rows.map((row) => row.attachmentId));
      if (checkpoint.attachmentCount !== rows.length || refIds.size !== rows.length || rowIds.size !== rows.length || [...rowIds].some((id) => !refIds.has(id)) || rows.reduce((total, row) => total + row.sizeBytes, 0) !== checkpoint.attachmentBytes) throw new PersistenceError('recovery-checkpoint-incomplete', 'Recovery checkpoint attachment rows do not match the complete checkpoint record.');
      if (rowError) throw new PersistenceError('recovery-usage-corrupt', rowError);
      await done;
    } catch (error) {
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-load-failed', String(error?.message || error), { cause: error });
    }
    const snapshot = {
      workspaceId, capturedRevision: checkpoint.capturedRevision, datasetToken: 0,
      tree: checkpoint.tree, nodeCount: checkpoint.nodeCount,
      attachmentRefs: checkpoint.attachmentRefs, attachmentCount: checkpoint.attachmentCount,
      totalAttachmentBytes: checkpoint.attachmentBytes,
      attachments: rows.map((row) => ({ persistentId: row.attachmentId, blob: row.blob, originalName: row.originalName, sizeBytes: row.sizeBytes, mime: row.mime, classification: row.classification ?? null, sha256: row.sha256 })),
      mapping: new Map()
    };
    let owned;
    try { owned = await ownValidatedRecoverySnapshot(snapshot, { policyContext: repositoryPolicyContext }); }
    catch (error) { if (error instanceof PersistenceError && error.code === 'recovery-attachment-missing') throw new PersistenceError('recovery-checkpoint-incomplete', 'Recovery checkpoint attachment rows are incomplete.'); throw error instanceof PersistenceError ? error : new PersistenceError('recovery-checkpoint-invalid', String(error?.message || error)); }
    return {
      workspace: control, checkpoint,
      attachments: owned.attachments.map((row) => ({ attachmentId: row.persistentId, blob: row.blob, metadata: { attachmentId: row.persistentId, originalName: row.originalName, sizeBytes: row.sizeBytes, mime: row.mime, classification: row.classification ?? null }, sha256: row.sha256 }))
    };
  }
  async function listCandidates() {
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS], 'readonly');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = await requestToPromise(tx.objectStore(STORE_RECOVERY_WORKSPACES).getAll());
      const checkpointsStore = tx.objectStore(STORE_RECOVERY_CHECKPOINTS);
      const result = [];
      for (const workspace of workspaces || []) {
        const error = validateRecoveryWorkspace(workspace);
        if (error) throw new PersistenceError('recovery-workspace-invalid', error);
        if (workspace.state !== 'active' || !workspace.activeCheckpointGeneration) continue;
        const checkpoint = await requestToPromise(checkpointsStore.get([workspace.workspaceId, workspace.activeCheckpointGeneration]));
        if (!checkpoint) continue;
        const checkpointError = validateRecoveryCheckpoint(checkpoint);
        if (checkpointError) throw new PersistenceError('recovery-checkpoint-invalid', checkpointError);
        if (checkpointIdentityError(workspace, checkpoint, { workspaceId: workspace.workspaceId, workspaceToken: workspace.workspaceToken, checkpointGeneration: workspace.activeCheckpointGeneration })) continue;
        result.push({ workspace, checkpoint });
      }
      await done;
      return result.sort((left, right) => right.workspace.updatedAt.localeCompare(left.workspace.updatedAt));
    } catch (error) {
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-list-failed', String(error?.message || error), { cause: error });
    }
  }

  async function beginSave({ workspaceId, workspaceToken } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryWorkspaceToken(workspaceToken)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace identity is invalid.');
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (control.workspaceToken !== workspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery workspace token does not match.');
      if (control.state !== 'active') throw new PersistenceError('recovery-tombstoned', 'Recovery workspace is not active.');
      if (control.pendingSave) throw new PersistenceError('recovery-save-in-flight', 'A recovery save reservation is already pending.');
      const saveId = createRecoverySaveId();
      const saveSequence = control.nextSequence;
      control.nextSequence += 1;
      control.controlVersion += 1;
      control.pendingSave = { saveId, sequence: saveSequence, issuedAt: timestamp };
      control.lastSaveStarted = { saveId, sequence: saveSequence, startedAt: timestamp };
      control.updatedAt = timestamp;
      workspaces.put(control);
      await done;
      return { ok: true, saveId, saveSequence, controlVersion: control.controlVersion };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-save-reservation-failed', String(error?.message || error), { cause: error });
    }
  }

  async function abandonSave({ workspaceId, workspaceToken, saveId } = {}) {
    if (!isRecoverySaveId(saveId)) throw new PersistenceError('recovery-save-invalid', 'Recovery save ID is invalid.');
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (control.workspaceToken !== workspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery workspace token does not match.');
      if (!control.pendingSave || control.pendingSave.saveId !== saveId) throw new PersistenceError('recovery-save-mismatch', 'Recovery save reservation does not match.');
      control.pendingSave = null;
      control.controlVersion += 1;
      control.updatedAt = timestamp;
      workspaces.put(control);
      await done;
      return { ok: true };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-save-abandon-failed', String(error?.message || error), { cause: error });
    }
  }

  async function retireThrough({ workspaceId, workspaceToken, saveId, saveSequence } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryWorkspaceToken(workspaceToken)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace identity is invalid.');
    if (!isRecoverySaveId(saveId)) throw new PersistenceError('recovery-save-invalid', 'Recovery save ID is invalid.');
    if (!Number.isSafeInteger(saveSequence) || saveSequence < 1) throw new PersistenceError('recovery-save-invalid', 'Recovery save sequence is invalid.');
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (control.workspaceToken !== workspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery workspace token does not match.');
      if (control.state !== 'active') throw new PersistenceError('recovery-tombstoned', 'Recovery workspace is not active.');
      if (control.lastSaveCompleted && control.lastSaveCompleted.saveId === saveId && control.lastSaveCompleted.sequence === saveSequence) return { ok: true, duplicate: true, workspace: control };
      if (!control.pendingSave || control.pendingSave.saveId !== saveId || control.pendingSave.sequence !== saveSequence) throw new PersistenceError('recovery-save-mismatch', 'Recovery save reservation does not match the completion.');
      const { legacyRows, recoveryRows } = await readRows(tx);
      const checkpointsStore = tx.objectStore(STORE_RECOVERY_CHECKPOINTS);
      const attachmentsStore = tx.objectStore(STORE_RECOVERY_ATTACHMENTS);
      const checkpoints = (await requestToPromise(checkpointsStore.getAll())).filter((row) => row.workspaceId === workspaceId);
      for (const checkpoint of checkpoints) {
        if (checkpoint.checkpointGeneration <= saveSequence) assertCheckpointCapacity(checkpoint, repositoryPolicyContext, 'Retired recovery checkpoint');
      }
      const removed = (await requestToPromise(attachmentsStore.getAll())).filter((row) => row.workspaceId === workspaceId && row.checkpointGeneration <= saveSequence);
      for (const checkpoint of checkpoints) {
        if (checkpoint.checkpointGeneration <= saveSequence) checkpointsStore.delete([workspaceId, checkpoint.checkpointGeneration]);
      }
      for (const row of removed) attachmentsStore.delete([workspaceId, row.checkpointGeneration, row.attachmentId]);
      const remaining = checkpoints.filter((checkpoint) => checkpoint.checkpointGeneration > saveSequence).map((checkpoint) => checkpoint.checkpointGeneration).sort((a, b) => b - a);
      control.activeCheckpointGeneration = remaining[0] ?? null;
      control.pendingSave = null;
      control.lastSaveCompleted = { saveId, sequence: saveSequence, completedAt: timestamp };
      control.retiredThroughSequence = Math.max(control.retiredThroughSequence, saveSequence);
      control.controlVersion += 1;
      control.updatedAt = timestamp;
      const controlError = validateRecoveryWorkspace(control);
      if (controlError) throw new PersistenceError('recovery-workspace-invalid', controlError);
      workspaces.put(control);
      const libraryBytes = sum(legacyRows);
      const recoveryBytes = sum(recoveryRows) - sum(removed);
      if (recoveryBytes > libraryHardCapBytes || libraryBytes + recoveryBytes > libraryHardCapBytes) throw new PersistenceError('recovery-capacity', 'Combined attachment storage cap would be exceeded.');
      writeUsage(tx.objectStore(STORE_META), libraryBytes, recoveryBytes, timestamp);
      await done;
      return { ok: true, saveId, saveSequence, retiredGenerations: checkpoints.filter((checkpoint) => checkpoint.checkpointGeneration <= saveSequence).map((checkpoint) => checkpoint.checkpointGeneration), activeCheckpointGeneration: control.activeCheckpointGeneration, libraryBytes, recoveryBytes, combinedBytes: libraryBytes + recoveryBytes, workspace: control };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-retire-failed', String(error?.message || error), { cause: error });
    }
  }

  async function claimSource({ workspaceId, claimId = createRecoveryClaimId(), ttlMs = 120000, expectedCheckpointGeneration = null, expectedCheckpointId = null } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryClaimId(claimId)) throw new PersistenceError('recovery-claim-invalid', 'Recovery claim identity is invalid.');
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new PersistenceError('recovery-claim-invalid', 'Recovery claim duration is invalid.');
    const now = new Date(clock());
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS], 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (control.state !== 'active') throw new PersistenceError('recovery-tombstoned', 'Recovery source is not active.');
      if (!control.activeCheckpointGeneration) throw new PersistenceError('recovery-source-empty', 'Recovery source has no checkpoint.');
      if (expectedCheckpointGeneration !== null && control.activeCheckpointGeneration !== expectedCheckpointGeneration) throw new PersistenceError('recovery-source-advanced', 'Recovery source generation changed.');
      if (control.claim && Date.parse(control.claim.expiresAt) > now.getTime()) throw new PersistenceError('recovery-claimed', 'Recovery source is already claimed.');
      const claimedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
      const checkpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([workspaceId, control.activeCheckpointGeneration]));
      if (!checkpoint) throw new PersistenceError('recovery-source-empty', 'Recovery source has no complete checkpoint.');
      if (expectedCheckpointId !== null && checkpoint.checkpointId !== expectedCheckpointId) throw new PersistenceError('recovery-source-checkpoint-mismatch', 'Recovery source checkpoint changed.');
      const checkpointError = validateRecoveryCheckpoint(checkpoint);
      if (checkpointError) throw new PersistenceError('recovery-checkpoint-invalid', checkpointError);
      const identityError = checkpointIdentityError(control, checkpoint, { workspaceId, workspaceToken: control.workspaceToken, checkpointGeneration: control.activeCheckpointGeneration });
      if (identityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', identityError);
      control.claim = { claimId, claimedAt, expiresAt, checkpointGeneration: control.activeCheckpointGeneration, checkpointId: checkpoint.checkpointId };
      control.controlVersion += 1;
      control.updatedAt = claimedAt;
      workspaces.put(control);
      await done;
      return { ok: true, claimId, claimedAt, expiresAt, checkpointGeneration: control.activeCheckpointGeneration, checkpointId: checkpoint.checkpointId, controlVersion: control.controlVersion };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-claim-failed', String(error?.message || error), { cause: error });
    }
  }

  async function releaseClaim({ workspaceId, claimId } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryClaimId(claimId)) throw new PersistenceError('recovery-claim-invalid', 'Recovery claim identity is invalid.');
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES], 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (!control.claim || control.claim.claimId !== claimId) throw new PersistenceError('recovery-claim-mismatch', 'Recovery claim does not match.');
      control.claim = null;
      control.controlVersion += 1;
      control.updatedAt = timestamp;
      workspaces.put(control);
      await done;
      return { ok: true };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-claim-release-failed', String(error?.message || error), { cause: error });
    }
  }

  async function supersedeSource({ sourceWorkspaceId, sourceWorkspaceToken, sourceCheckpointId, sourceCheckpointGeneration, childWorkspaceId, childCheckpointGeneration } = {}) {
    if (!isRecoveryWorkspaceId(sourceWorkspaceId) || !isRecoveryWorkspaceToken(sourceWorkspaceToken) || !isRecoveryWorkspaceId(childWorkspaceId)) throw new PersistenceError('recovery-supersede-invalid', 'Recovery supersession identity is invalid.');
    if (!isRecoveryCheckpointId(sourceCheckpointId)) throw new PersistenceError('recovery-supersede-invalid', 'Recovery source checkpoint ID is invalid.');
    if (!Number.isSafeInteger(sourceCheckpointGeneration) || sourceCheckpointGeneration < 1 || !Number.isSafeInteger(childCheckpointGeneration) || childCheckpointGeneration < 1) throw new PersistenceError('recovery-supersede-invalid', 'Recovery supersession generation is invalid.');
    if (sourceWorkspaceId === childWorkspaceId) throw new PersistenceError('recovery-supersede-invalid', 'A workspace cannot supersede itself.');
    try { await loadCheckpoint(sourceWorkspaceId, sourceCheckpointGeneration); } catch (error) { if (error?.code !== 'recovery-checkpoint-inactive') throw error; }
    try { await loadCheckpoint(childWorkspaceId, childCheckpointGeneration); } catch (error) { throw new PersistenceError('recovery-child-not-durable', 'Child recovery checkpoint is incomplete or missing.', { cause: error }); }
    const opened = await ensureHandle();
    const timestamp = iso(clock());
    const tx = opened.transaction([STORE_RECOVERY_WORKSPACES, STORE_RECOVERY_CHECKPOINTS], 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const source = await requestToPromise(workspaces.get(sourceWorkspaceId));
      const sourceError = validateRecoveryWorkspace(source);
      if (sourceError) throw new PersistenceError('recovery-workspace-invalid', sourceError);
      if (source.workspaceToken !== sourceWorkspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery source token does not match.');
      if (source.state !== 'active') throw new PersistenceError('recovery-source-inactive', 'Recovery source is not active.');
      if (source.activeCheckpointGeneration !== sourceCheckpointGeneration) throw new PersistenceError('recovery-source-advanced', 'Recovery source advanced beyond the forked generation.');
      const sourceCheckpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([sourceWorkspaceId, sourceCheckpointGeneration]));
      if (!sourceCheckpoint || sourceCheckpoint.checkpointId !== sourceCheckpointId) throw new PersistenceError('recovery-source-checkpoint-mismatch', 'Recovery source checkpoint identity does not match.');
      const sourceIdentityError = checkpointIdentityError(source, sourceCheckpoint, { workspaceId: sourceWorkspaceId, workspaceToken: sourceWorkspaceToken, checkpointGeneration: sourceCheckpointGeneration, checkpointId: sourceCheckpointId });
      if (sourceIdentityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', sourceIdentityError);
      const child = await requestToPromise(workspaces.get(childWorkspaceId));
      const childError = validateRecoveryWorkspace(child);
      if (childError) throw new PersistenceError('recovery-workspace-invalid', childError);
      if (child.state !== 'active' || !child.forkedFrom || child.forkedFrom.workspaceId !== sourceWorkspaceId || child.forkedFrom.checkpointGeneration !== sourceCheckpointGeneration || child.forkedFrom.checkpointId !== sourceCheckpointId || child.forkedFrom.workspaceToken !== sourceWorkspaceToken) throw new PersistenceError('recovery-child-invalid', 'Child workspace is not forked from the claimed source generation.');
      const childCheckpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([childWorkspaceId, childCheckpointGeneration]));
      if (!childCheckpoint) throw new PersistenceError('recovery-child-not-durable', 'Child workspace has no durable checkpoint.');
      const childCheckpointError = validateRecoveryCheckpoint(childCheckpoint);
      if (childCheckpointError) throw new PersistenceError('recovery-child-not-durable', childCheckpointError);
      const childIdentityError = checkpointIdentityError(child, childCheckpoint, { workspaceId: childWorkspaceId, workspaceToken: child.workspaceToken, checkpointGeneration: childCheckpointGeneration });
      if (childIdentityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', childIdentityError);
      if (child.activeCheckpointGeneration !== childCheckpointGeneration) throw new PersistenceError('recovery-child-not-durable', 'Child checkpoint is not active.');
      source.state = 'superseded';
      source.supersededBy = { workspaceId: childWorkspaceId, checkpointGeneration: childCheckpointGeneration };
      source.controlVersion += 1;
      source.updatedAt = timestamp;
      workspaces.put(source);
      await done;
      return { ok: true, sourceWorkspaceId, sourceCheckpointGeneration, supersededBy: source.supersededBy };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-supersede-failed', String(error?.message || error), { cause: error });
    }
  }

  async function discardWorkspace({ workspaceId, workspaceToken, claimId = null, expectedCheckpointId = null, expectedCheckpointGeneration = null, ownerControlVersion = null } = {}) {
    if (!isRecoveryWorkspaceId(workspaceId) || !isRecoveryWorkspaceToken(workspaceToken)) throw new PersistenceError('recovery-workspace-invalid', 'Recovery workspace identity is invalid.');
    if (claimId !== null && !isRecoveryClaimId(claimId)) throw new PersistenceError('recovery-claim-invalid', 'Recovery claim identity is invalid.');
    if (expectedCheckpointGeneration !== null && (!Number.isSafeInteger(expectedCheckpointGeneration) || expectedCheckpointGeneration < 1)) throw new PersistenceError('recovery-discard-invalid', 'Expected source generation is invalid.');
    if (expectedCheckpointGeneration !== null && !isRecoveryCheckpointId(expectedCheckpointId)) throw new PersistenceError('recovery-discard-invalid', 'Expected source checkpoint ID is invalid.');
    if (claimId === null && (!Number.isSafeInteger(ownerControlVersion) || ownerControlVersion < 1)) throw new PersistenceError('recovery-discard-authorization', 'An owner control version or source claim is required.');
    const opened = await ensureHandle();
    const now = new Date(clock()); const timestamp = now.toISOString();
    const tx = opened.transaction(STORES, 'readwrite');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const workspaces = tx.objectStore(STORE_RECOVERY_WORKSPACES);
      const control = await requestToPromise(workspaces.get(workspaceId));
      const error = validateRecoveryWorkspace(control);
      if (error) throw new PersistenceError('recovery-workspace-invalid', error);
      if (control.workspaceToken !== workspaceToken) throw new PersistenceError('recovery-workspace-token-mismatch', 'Recovery workspace token does not match.');
      if (control.state !== 'active') throw new PersistenceError('recovery-tombstoned', 'Recovery workspace is not active.');
      if (claimId !== null) {
        if (!control.claim || control.claim.claimId !== claimId) throw new PersistenceError('recovery-claim-mismatch', 'Recovery claim does not match.');
        if (Date.parse(control.claim.expiresAt) <= now.getTime()) throw new PersistenceError('recovery-claim-expired', 'Recovery claim has expired.');
        if (control.claim.checkpointGeneration !== expectedCheckpointGeneration || control.claim.checkpointId !== expectedCheckpointId) throw new PersistenceError('recovery-claim-generation-mismatch', 'Recovery claim does not authorize this source generation.');
      } else {
        if (control.controlVersion !== ownerControlVersion) throw new PersistenceError('recovery-stale-owner', 'Recovery owner control version is stale.');
        if (control.claim && Date.parse(control.claim.expiresAt) > now.getTime()) throw new PersistenceError('recovery-claimed', 'Recovery source is currently claimed.');
      }
      if (control.activeCheckpointGeneration !== expectedCheckpointGeneration) throw new PersistenceError('recovery-source-advanced', 'Recovery source generation changed before discard.');
      let checkpoint = null;
      if (expectedCheckpointGeneration !== null) {
        checkpoint = await requestToPromise(tx.objectStore(STORE_RECOVERY_CHECKPOINTS).get([workspaceId, expectedCheckpointGeneration]));
        if (!checkpoint || checkpoint.checkpointId !== expectedCheckpointId) throw new PersistenceError('recovery-source-checkpoint-mismatch', 'Recovery source checkpoint identity does not match.');
        const identityError = checkpointIdentityError(control, checkpoint, { workspaceId, workspaceToken, checkpointGeneration: expectedCheckpointGeneration, checkpointId: expectedCheckpointId });
        if (identityError) throw new PersistenceError('recovery-checkpoint-identity-mismatch', identityError);
      }
      const { legacyRows, recoveryRows } = await readRows(tx);
      const removed = recoveryRows.filter((row) => row.workspaceId === workspaceId);
      const checkpoints = tx.objectStore(STORE_RECOVERY_CHECKPOINTS);
      const workspaceCheckpoints = (await requestToPromise(checkpoints.getAll())).filter((row) => row.workspaceId === workspaceId);
      for (const checkpoint of workspaceCheckpoints) assertCheckpointCapacity(checkpoint, repositoryPolicyContext, 'Discarded recovery checkpoint');
      for (const row of workspaceCheckpoints) checkpoints.delete([workspaceId, row.checkpointGeneration]);
      const attachments = tx.objectStore(STORE_RECOVERY_ATTACHMENTS);
      for (const row of removed) attachments.delete([workspaceId, row.checkpointGeneration, row.attachmentId]);
      control.state = 'discarded';
      control.activeCheckpointGeneration = null;
      control.pendingSave = null;
      control.claim = null;
      control.controlVersion += 1;
      control.updatedAt = timestamp;
      control.discardedAt = timestamp;
      const controlError = validateRecoveryWorkspace(control);
      if (controlError) throw new PersistenceError('recovery-workspace-invalid', controlError);
      workspaces.put(control);
      const libraryBytes = sum(legacyRows);
      const recoveryBytes = sum(recoveryRows) - sum(removed);
      writeUsage(tx.objectStore(STORE_META), libraryBytes, recoveryBytes, timestamp);
      await done;
      return { ok: true, workspaceId, discardedGeneration: expectedCheckpointGeneration, libraryBytes, recoveryBytes, combinedBytes: libraryBytes + recoveryBytes };
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-discard-failed', String(error?.message || error), { cause: error });
    }
  }

  async function combinedUsage() {
    const opened = await ensureHandle();
    const tx = opened.transaction([STORE_ATTACHMENTS, STORE_RECOVERY_ATTACHMENTS, STORE_META], 'readonly');
    const done = transactionDone(tx); done.catch(() => {});
    try {
      const { legacyRows, recoveryRows } = await readRows(tx);
      await done;
      return combined(sum(legacyRows), sum(recoveryRows), libraryHardCapBytes);
    } catch (error) {
      throw error instanceof PersistenceError ? error : new PersistenceError('recovery-usage-failed', String(error?.message || error), { cause: error });
    }
  }

  return {
    createWorkspace, loadWorkspace, saveCheckpoint, loadCheckpoint, listCandidates,
    beginSave, abandonSave, retireThrough, claimSource, releaseClaim, supersedeSource,
    discardWorkspace, combinedUsage
  };
}










