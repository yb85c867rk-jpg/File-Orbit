import { BACKUP_HEADER_BYTES, BACKUP_MANIFEST_MAX_BYTES, BACKUP_MAX_TOTAL_ATTACHMENT_BYTES } from '../../../src/engine/hypertree/persistence/backup.js';

export const MAX_ORBIT_BASELINE_BYTES = BACKUP_HEADER_BYTES + BACKUP_MANIFEST_MAX_BYTES + BACKUP_MAX_TOTAL_ATTACHMENT_BYTES;

function failure(reason, stage, message = 'Baseline operation failed.', extra = {}) {
  return { ok: false, reason, stage, message, ...extra };
}

function staleFailure(stage) {
  return { ok: false, reason: 'stale', stale: true, stage };
}

function unverifiable(stage, message = 'The destination content could not be verified. Save a Copy or cancel instead of overwriting.') {
  return { ok: false, reason: 'unverifiable', stage, actionable: true, unverifiable: true, allowedDecisions: Object.freeze(['copy', 'cancel']), message };
}

function isBlob(value) { return Boolean(value && typeof value.size === 'number' && typeof value.slice === 'function'); }
function byteLength(value) {
  if (isBlob(value)) return Number(value.size) || 0;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return -1;
}

async function bytesFor(value) {
  if (isBlob(value)) return new Uint8Array(await value.arrayBuffer());
  if (value && typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

async function sha256Hex(value, cryptoApi) {
  const bytes = await bytesFor(value);
  if (!bytes) return null;
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function freezeObservation(observation) {
  if (!observation) return null;
  return Object.freeze({ ...observation });
}

function freezeVerification(verification) {
  if (!verification) return null;
  return Object.freeze({ ...verification });
}

function freezeBaseline(baseline) {
  return Object.freeze({
    ...baseline,
    verification: freezeVerification(baseline.verification)
  });
}

function publicBaseline(baseline) {
  if (!baseline) return null;
  return freezeBaseline({ ...baseline, verification: baseline.verification ? { ...baseline.verification } : null });
}

function normalizedBinding(binding = {}) {
  return {
    handle: binding.handle || null,
    documentIdentity: binding.documentIdentity ?? null,
    revision: binding.revision ?? null,
    session: binding.session ?? null,
    operation: binding.operation ?? null
  };
}

function current(isCurrent) {
  try { return isCurrent ? Boolean(isCurrent()) : true; } catch { return false; }
}

function isSizeAllowed(size, limits) {
  const max = Number(limits?.maxBytes) || MAX_ORBIT_BASELINE_BYTES;
  return Number.isFinite(size) && size >= 0 && size <= max;
}

async function readActual(handle, { hash = true, cryptoApi = globalThis.crypto, limits = {} } = {}) {
  if (!handle || typeof handle.getFile !== 'function') return failure('invalid-handle', 'read', 'A file handle is required.');
  let file;
  try { file = await handle.getFile(); }
  catch (error) {
    if (error?.name === 'NotFoundError') return failure('not-found', 'read', 'The destination file no longer exists.');
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return failure('permission-denied', 'read', 'File permission was denied.');
    return failure('read-failed', 'read', 'Could not read the destination file.');
  }
  const size = Number(file?.size);
  if (!isSizeAllowed(size, limits)) return failure('size-limit', 'read', 'The destination file exceeds the baseline size limit.', { size });
  if (!hash) return { ok: true, observation: Object.freeze({ size, lastModified: Number(file?.lastModified) || 0 }), file };
  let digest;
  try { digest = await sha256Hex(file, cryptoApi); }
  catch { return failure('hash-failed', 'read', 'Could not hash the destination file.'); }
  return { ok: true, observation: Object.freeze({ size, lastModified: Number(file?.lastModified) || 0, digest }), file };
}

export async function createOpenedContentBaseline({
  handle,
  bytes,
  observed = {},
  binding = {},
  cryptoApi = globalThis.crypto,
  limits = {},
  now = () => Date.now(),
  isCurrent = () => true
} = {}) {
  if (!handle || typeof handle.getFile !== 'function') return failure('invalid-handle', 'capture', 'A file handle is required.');
  const size = byteLength(bytes);
  if (size < 0) return failure('invalid-bytes', 'capture', 'The opened document bytes are invalid.');
  if (!isSizeAllowed(size, limits)) return failure('size-limit', 'capture', 'The opened document exceeds the baseline size limit.', { size });
  const expectedSize = observed.size === undefined ? size : Number(observed.size);
  if (!Number.isFinite(expectedSize) || expectedSize !== size) return failure('metadata-mismatch', 'capture', 'The opened bytes do not match the observed file size.');
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'capture' };
  let digest;
  try { digest = await sha256Hex(bytes, cryptoApi); }
  catch { return current(isCurrent) ? failure('hash-failed', 'capture', 'Could not hash the opened document bytes.') : staleFailure('capture'); }
  if (!digest) return current(isCurrent) ? failure('hash-failed', 'capture', 'Could not hash the opened document bytes.') : staleFailure('capture');
  if (!current(isCurrent)) return staleFailure('capture');
  const bound = normalizedBinding({ ...binding, handle: binding.handle || handle });
  if (bound.handle !== handle) return failure('handle-mismatch', 'capture', 'The opened document handle does not match the baseline handle.');
  const baseline = publicBaseline({
    state: 'known',
    provenance: 'opened-content',
    digest,
    size,
    lastModified: Number(observed.lastModified) || 0,
    ...bound,
    capturedAt: now(),
    verification: null
  });
  return { ok: true, baseline };
}

export function bindBaseline(baseline, binding = {}) {
  if (!baseline) return failure('invalid-baseline', 'bind', 'A baseline is required.');
  const handle = binding.handle || baseline.handle;
  if (baseline.handle && handle !== baseline.handle) return failure('handle-mismatch', 'bind', 'The baseline belongs to another file handle.');
  const bound = normalizedBinding({ ...binding, handle });
  return {
    ok: true,
    baseline: publicBaseline({ ...baseline, ...bound, verification: baseline.verification ? { ...baseline.verification } : null })
  };
}

export async function verifyOpenedContentBaseline(baseline, {
  isCurrent = () => true,
  cryptoApi = globalThis.crypto,
  limits = {},
  now = () => Date.now()
} = {}) {
  if (!baseline || baseline.provenance !== 'opened-content' || !baseline.digest) {
    return failure('invalid-baseline', 'verify-open', 'An opened-content baseline is required.');
  }
  if (!baseline.handle || typeof baseline.handle.getFile !== 'function') return failure('invalid-handle', 'verify-open', 'The baseline handle is unavailable.');
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-open' };
  const read = await readActual(baseline.handle, { hash: false, limits });
  if (!read.ok) return current(isCurrent) ? { ...read, verificationFailed: true, baseline: publicBaseline({ ...baseline, state: 'unknown', verification: null }) } : staleFailure('verify-open');
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-open' };
  const observation = read.observation;
  const verificationBase = { size: observation.size, lastModified: observation.lastModified, digest: null, at: now(), reason: 'post-open-verification' };
  if (observation.size !== baseline.size || observation.lastModified !== baseline.lastModified) {
    const changed = publicBaseline({ ...baseline, state: 'changed', verification: { ...verificationBase, reason: 'metadata-changed' } });
    return { ok: false, reason: 'changed', stage: 'verify-open', baseline: changed, verificationFailed: true };
  }
  let digest;
  try { digest = await sha256Hex(read.file, cryptoApi); }
  catch { return current(isCurrent) ? { ok: false, reason: 'hash-failed', stage: 'verify-open', verificationFailed: true, baseline: publicBaseline({ ...baseline, state: 'observed', verification: verificationBase }) } : staleFailure('verify-open'); }
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-open' };
  const verification = { ...verificationBase, digest, at: now() };
  if (digest !== baseline.digest) {
    return { ok: false, reason: 'changed', stage: 'verify-open', baseline: publicBaseline({ ...baseline, state: 'changed', verification }), verificationFailed: true };
  }
  return { ok: true, baseline: publicBaseline({ ...baseline, state: 'known', verification }) };
}

export async function createConfirmedWriteBaseline({
  handle,
  writtenBytes,
  binding = {},
  isCurrent = () => true,
  cryptoApi = globalThis.crypto,
  limits = {},
  now = () => Date.now()
} = {}) {
  if (!handle || typeof handle.getFile !== 'function') return failure('invalid-handle', 'verify-write', 'A file handle is required.');
  const size = byteLength(writtenBytes);
  if (size < 0) return failure('invalid-bytes', 'verify-write', 'The written document bytes are invalid.');
  if (!isSizeAllowed(size, limits)) return failure('size-limit', 'verify-write', 'The written document exceeds the baseline size limit.', { size });
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-write' };
  let writtenDigest;
  try { writtenDigest = await sha256Hex(writtenBytes, cryptoApi); }
  catch { return current(isCurrent) ? failure('hash-failed', 'verify-write', 'Could not hash the written document.') : staleFailure('verify-write'); }
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-write' };
  const bound = normalizedBinding({ ...binding, handle: binding.handle || handle });
  if (bound.handle !== handle) return failure('handle-mismatch', 'verify-write', 'The written document handle does not match the baseline handle.');
  const read = await readActual(handle, { hash: false, limits, cryptoApi });
  if (!read.ok) {
    if (!current(isCurrent)) return staleFailure('verify-write');
    return {
      ...read,
      verificationFailed: true,
      baseline: publicBaseline({
        state: read.reason === 'not-found' ? 'unknown' : 'unknown',
        provenance: 'confirmed-write',
        digest: writtenDigest,
        size,
        lastModified: 0,
        ...bound,
        capturedAt: now(),
        verification: null
      })
    };
  }
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-write' };
  const observation = read.observation;
  const verificationBase = { size: observation.size, lastModified: observation.lastModified, digest: null, at: now(), reason: 'post-write-verification' };
  let actualDigest;
  try { actualDigest = await sha256Hex(read.file, cryptoApi); }
  catch { return current(isCurrent) ? { ok: false, reason: 'hash-failed', stage: 'verify-write', verificationFailed: true, baseline: publicBaseline({ state: 'observed', provenance: 'confirmed-write', digest: writtenDigest, size: observation.size, lastModified: observation.lastModified, ...bound, capturedAt: now(), verification: verificationBase }) } : staleFailure('verify-write'); }
  if (!current(isCurrent)) return { ok: false, reason: 'stale', stale: true, stage: 'verify-write' };
  const verification = { ...verificationBase, digest: actualDigest };
  if (actualDigest !== writtenDigest) {
    return { ok: false, reason: 'changed', stage: 'verify-write', verificationFailed: true, baseline: publicBaseline({ state: 'changed', provenance: 'confirmed-write', digest: writtenDigest, size: observation.size, lastModified: observation.lastModified, ...bound, capturedAt: now(), verification }) };
  }
  return { ok: true, baseline: publicBaseline({ state: 'known', provenance: 'confirmed-write', digest: writtenDigest, size: observation.size, lastModified: observation.lastModified, ...bound, capturedAt: now(), verification }) };
}

function observationForConflict(observation) { return freezeObservation({ ...observation }); }

function conflictFor(baseline, observation, reason) {
  return Object.freeze({
    handle: baseline.handle,
    documentIdentity: baseline.documentIdentity,
    operation: baseline.operation,
    baselineState: baseline.state,
    baselineDigest: baseline.digest,
    reason,
    observation: observationForConflict(observation)
  });
}

export async function preflightOverwrite({
  baseline,
  handle,
  documentIdentity = undefined,
  approval = null,
  isCurrent = () => true,
  cryptoApi = globalThis.crypto,
  limits = {}
} = {}) {
  if (!baseline || !baseline.digest || !baseline.handle) return failure('invalid-baseline', 'preflight', 'An authoritative baseline is required.');
  if (baseline.operation === null || baseline.documentIdentity === null || baseline.session === null) {
    return failure('unbound-baseline', 'preflight', 'The baseline is not bound to a committed document operation.');
  }
  if (!handle || handle !== baseline.handle) return failure('handle-mismatch', 'preflight', 'The destination handle does not match the baseline.');
  const identity = documentIdentity === undefined ? baseline.documentIdentity : documentIdentity;
  if (baseline.documentIdentity !== null && identity !== baseline.documentIdentity) return failure('identity-mismatch', 'preflight', 'The destination document identity does not match the baseline.');
  if (approval && (!approval.observation || !Number.isFinite(approval.observation.size) || !Number.isFinite(approval.observation.lastModified) || approval.handle !== handle || approval.documentIdentity !== baseline.documentIdentity || approval.operation !== baseline.operation)) {
    return failure('approval-mismatch', 'preflight', 'The overwrite approval belongs to another destination or operation.');
  }
  if (!current(isCurrent)) return staleFailure('preflight');
  const read = await readActual(handle, { hash: false, limits, cryptoApi });
  if (!read.ok) return current(isCurrent) ? (read.reason === 'not-found' ? { ...read, actionable: true } : read) : staleFailure('preflight');
  if (!current(isCurrent)) return staleFailure('preflight');
  const observation = read.observation;
  if (approval) {
    if (observation.size !== approval.observation.size || observation.lastModified !== approval.observation.lastModified) {
      return current(isCurrent) ? { ok: false, reason: 'approval-stale', stage: 'preflight', actionable: true } : staleFailure('preflight');
    }
    const approvedDigest = /^[0-9a-f]{64}$/i.test(String(approval.observation.digest || '')) ? String(approval.observation.digest).toLowerCase() : null;
    if (!approvedDigest) {
      // An approval without content cannot authorize anything. A newly readable
      // file must establish a fresh conflict observation and user decision.
      let freshDigest = null;
      try { freshDigest = await sha256Hex(read.file, cryptoApi); } catch {}
      if (!current(isCurrent)) return staleFailure('preflight');
      if (!freshDigest) return unverifiable('preflight');
      return { ok: false, reason: 'conflict', stage: 'preflight', actionable: true, requiresNewDecision: true, conflict: conflictFor(baseline, { ...observation, digest: freshDigest }, 'approval-unverifiable') };
    }
    let digest;
    try { digest = await sha256Hex(read.file, cryptoApi); }
    catch { return current(isCurrent) ? unverifiable('preflight') : staleFailure('preflight'); }
    if (!current(isCurrent)) return staleFailure('preflight');
    if (digest !== approvedDigest) return { ok: false, reason: 'approval-stale', stage: 'preflight', actionable: true };
    return { ok: true, stage: 'preflight', approved: true, observation: observationForConflict(observation), scope: Object.freeze({ handle, documentIdentity: baseline.documentIdentity, operation: baseline.operation }) };
  }
  const metadataDiffers = observation.size !== baseline.size || observation.lastModified !== baseline.lastModified;
  if (baseline.state !== 'known' || metadataDiffers) {
    let digest = null;
    try { digest = await sha256Hex(read.file, cryptoApi); }
    catch { return current(isCurrent) ? unverifiable('preflight') : staleFailure('preflight'); }
    if (!current(isCurrent)) return staleFailure('preflight');
    if (!digest) return unverifiable('preflight');
    return { ok: false, reason: 'conflict', stage: 'preflight', actionable: true, conflict: conflictFor(baseline, { ...observation, digest }, baseline.state === 'known' ? 'metadata-changed' : baseline.state) };
  }
  let digest;
  try { digest = await sha256Hex(read.file, cryptoApi); }
  catch { return current(isCurrent) ? unverifiable('preflight') : staleFailure('preflight'); }
  if (!current(isCurrent)) return staleFailure('preflight');
  if (digest !== baseline.digest) {
    return { ok: false, reason: 'conflict', stage: 'preflight', actionable: true, conflict: conflictFor(baseline, { ...observation, digest }, 'content-changed') };
  }
  return { ok: true, stage: 'preflight', approved: false, observation: observationForConflict(observation), scope: Object.freeze({ handle, documentIdentity: baseline.documentIdentity, operation: baseline.operation }) };
}


export function createOverwriteApproval(conflict, { isCurrent = () => true } = {}) {
  if (!conflict || !conflict.handle || !conflict.observation) return failure('invalid-conflict', 'approval', 'A conflict is required.');
  if (!current(isCurrent)) return staleFailure('approval');
  if (!/^[0-9a-f]{64}$/i.test(String(conflict.observation.digest || ''))) return unverifiable('approval');
  return {
    ok: true,
    approval: Object.freeze({
      handle: conflict.handle,
      documentIdentity: conflict.documentIdentity,
      operation: conflict.operation,
      observation: freezeObservation(conflict.observation),
      approvedAt: Date.now()
    })
  };
}
