/**
 * R3 Rename Map filesystem backend.
 *
 * Supported strategy: create-new / write / verify / remove-original for
 * distinct, non-equivalent filenames. Direct move, case-only rename,
 * temporary two-step rename, permission requests and live document adoption
 * are intentionally deferred.
 *
 * Mutation callbacks receive both:
 * - isCurrent: synchronous cancellation + captured ownership predicate
 * - assertCurrent: asynchronous ownership/handle/parent revalidation
 * Adapters that perform asynchronous work must await assertCurrent immediately
 * before their mutation.
 */
import { decodeBackup } from '../persistence/backup.js';

function base(status, extra = {}) {
  return Object.freeze({ ok: false, status, schema: 'fileorbit-rename-execution-v1', ...extra });
}

function isNotFound(error) {
  return error?.name === 'NotFoundError' || error?.code === 'ENOENT';
}

async function digest(blob, cryptoApi) {
  if (!blob || !cryptoApi?.subtle) throw new Error('Crypto digest is unavailable.');
  const bytes = await blob.arrayBuffer();
  const value = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sameEntry(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  try { return typeof left.isSameEntry === 'function' ? Boolean(await left.isSameEntry(right)) : false; } catch { return false; }
}

async function readInfo(handle, cryptoApi) {
  const file = await handle.getFile();
  const blob = file instanceof Blob ? file : new Blob([file]);
  return Object.freeze({
    handle,
    name: String(handle.name || file.name || ''),
    size: Number(file.size),
    lastModified: Number(file.lastModified),
    digest: await digest(blob, cryptoApi),
    blob
  });
}

async function probe(resolve, cryptoApi, { expectedHandle = null, expectedSize = null, expectedDigest = null } = {}) {
  let handle;
  try { handle = await resolve(); }
  catch (error) {
    if (isNotFound(error)) return Object.freeze({ status: 'absent', present: false, readError: false, handleMatch: false, verified: false, name: '', size: null, digest: null, lastModified: null });
    return Object.freeze({ status: 'read-error', present: false, readError: true, handleMatch: false, verified: false, name: '', size: null, digest: null, lastModified: null, errorName: String(error?.name || '') });
  }
  const handleMatch = expectedHandle ? await sameEntry(handle, expectedHandle) : true;
  let info;
  try { info = await readInfo(handle, cryptoApi); }
  catch (error) {
    return Object.freeze({ status: 'read-error', present: true, readError: true, handleMatch, verified: false, name: String(handle.name || ''), size: null, digest: null, lastModified: null, handle, errorName: String(error?.name || '') });
  }
  const verified = Boolean(handleMatch
    && (expectedSize === null || info.size === expectedSize)
    && (expectedDigest === null || info.digest === String(expectedDigest).toLowerCase()));
  return Object.freeze({ status: 'present', present: true, readError: false, handleMatch, verified, name: info.name, size: info.size, digest: info.digest, lastModified: info.lastModified, handle, blob: info.blob });
}

function mutateCounts(counts) { return Object.freeze({ createCalls: counts.createCalls, writeCalls: counts.writeCalls, removeCalls: counts.removeCalls }); }

export function buildRenameRemovalRetryPlan({ outcome = null } = {}) {
  if (!outcome || outcome.status !== 'verified-new-original-retained' || !outcome.files?.source?.present || !outcome.files?.source?.verified || !outcome.files?.destination?.present || !outcome.files?.destination?.verified) {
    return Object.freeze({ ok: false, schema: 'fileorbit-rename-retry-v1', reason: 'retry-not-available', message: 'Retry removal is only available for a verified new copy with both files still present.' });
  }
  return Object.freeze({
    ok: true,
    schema: 'fileorbit-rename-retry-v1',
    automatic: false,
    requiresExplicitConfirmation: true,
    sourceName: outcome.files.source.name,
    destinationName: outcome.files.destination.name,
    sourceDigest: outcome.files.source.digest,
    destinationDigest: outcome.files.destination.digest,
    steps: Object.freeze(['revalidate-current-ownership', 'revalidate-source-content', 'revalidate-new-content', 'remove-original-with-explicit-confirmation'])
  });
}

export function createRenameExecutor({ adapter = null, cryptoApi = globalThis.crypto } = {}) {
  let inFlight = false;

  async function execute({ plan = null, candidate = null, permissions = null, getState = null, isCancelled = () => false } = {}) {
    if (inFlight) return base('busy', { reason: 'in-flight', message: 'A Rename Map execution is already in progress.', mutations: { createCalls: 0, writeCalls: 0, removeCalls: 0 } });
    inFlight = true;
    try {
      const counts = { createCalls: 0, writeCalls: 0, removeCalls: 0 };
      let candidateDigest = null;
      let createdHandle = null;

      const current = () => {
        try { return !Boolean(isCancelled?.()); } catch { return false; }
      };
      const stateSnapshot = () => {
        if (typeof getState !== 'function') return null;
        try { return getState(); } catch { return null; }
      };
      const stateFieldsMatch = (state) => {
        if (!state) return false;
        for (const field of ['datasetToken', 'session', 'ownership', 'revision', 'documentIdentity']) {
          if (state[field] !== plan?.current?.[field]) return false;
        }
        return true;
      };
      const stateFieldsCurrent = (state) => {
        if (!stateFieldsMatch(state)) return false;
        if (state.handle !== plan?.current?.handle) return false;
        if (plan?.parent?.handle && (!state.parentHandle || state.parentHandle !== plan.parent.handle)) return false;
        return true;
      };
      const syncCurrent = () => current() && stateFieldsCurrent(stateSnapshot());
      const stateCurrent = async () => {
        if (!current()) return false;
        const state = stateSnapshot();
        if (!stateFieldsMatch(state)) return false;
        if (!(await sameEntry(state.handle, plan?.current?.handle))) return false;
        if (plan?.parent?.handle && (!state.parentHandle || !(await sameEntry(state.parentHandle, plan.parent.handle)))) return false;
        return true;
      };
      const assertCurrent = async () => {
        if (!current()) {
          const error = new Error('Rename Map was cancelled before the adapter mutation.');
          error.reason = 'cancelled';
          throw error;
        }
        if (!(await stateCurrent())) {
          const error = new Error('Document ownership changed before the adapter mutation.');
          error.reason = 'stale';
          throw error;
        }
      };
      const mutationCallbacks = () => ({ isCurrent: syncCurrent, assertCurrent });
      const sourceProbe = () => probe(
        () => adapter.getFileHandle(plan.parent.handle, plan.current.filename),
        cryptoApi,
        { expectedHandle: plan.current.handle, expectedSize: Number(plan.baseline?.size), expectedDigest: plan.baseline?.digest }
      );
      const destinationProbe = () => probe(
        () => adapter.getFileHandle(plan.parent.handle, plan.filename),
        cryptoApi,
        { expectedHandle: createdHandle, expectedSize: candidate?.packageSize ?? null, expectedDigest: candidateDigest }
      );
      const files = async () => {
        const source = await sourceProbe();
        const destination = await destinationProbe();
        return Object.freeze({
          source: Object.freeze({ name: plan?.current?.filename || '', present: source.present, status: source.status, readError: source.readError, handleMatch: source.handleMatch, verified: source.verified, size: source.size, digest: source.digest }),
          destination: Object.freeze({ name: plan?.filename || '', present: destination.present, status: destination.status, readError: destination.readError, handleMatch: destination.handleMatch, verified: destination.verified, size: destination.size, digest: destination.digest })
        });
      };
      const partial = async (status, stage, message, extra = {}) => {
        const fileState = await files();
        const verifiedCopy = status === 'verified-new-original-retained'
          && Boolean(fileState.source.present && fileState.source.verified && fileState.destination.present && fileState.destination.verified);
        return base(status, {
          reason: status, stage, message,
          files: fileState,
          mutations: mutateCounts(counts),
          partial: true,
          recovery: Object.freeze({
            required: true,
            automatic: false,
            requiresExplicitConfirmation: true,
            actions: Object.freeze(verifiedCopy ? ['retry-remove-original', 'open-new-copy'] : ['inspect-partial-new', 'open-original']),
            sourceName: plan?.current?.filename || null,
            destinationName: plan?.filename || null,
            sourceVerified: fileState.source.verified,
            destinationVerified: fileState.destination.verified,
            preserveBoth: Boolean(fileState.source.present && fileState.destination.present)
          }),
          ...extra
        });
      };

      const postRemovalUncertain = (fileState, removalAcknowledged, cancelledAfterRemoval = false) => {
        const sourceAbsentConfirmed = fileState.source.status === 'absent';
        const destinationIdentityConfirmed = fileState.destination.handleMatch === true;
        const destinationBytesConfirmed = fileState.destination.verified === true;
        return base('post-removal-uncertain', {
          reason: 'post-removal-verification-failed',
          stage: 'post-remove',
          message: removalAcknowledged
            ? 'The original removal was acknowledged, but final file state is uncertain. Do not adopt automatically; reinspect both names before recovery.'
            : 'The original removal was not acknowledged and final file state is uncertain. Do not adopt automatically; reinspect both names before recovery.',
          files: fileState,
          mutations: mutateCounts(counts),
          removalAcknowledged: Boolean(removalAcknowledged),
          destinationHandle: createdHandle,
          filesystemComplete: false,
          adoptionBlocked: true,
          requiresReinspection: true,
          cancelledAfterRemoval,
          recovery: Object.freeze({
            required: true,
            automatic: false,
            requiresReinspection: true,
            adoptionBlocked: true,
            actions: Object.freeze(['reinspect-files', 'do-not-adopt']),
            sourceAbsentConfirmed,
            destinationIdentityConfirmed,
            destinationBytesConfirmed
          })
        });
      };

      if (!plan || plan.ok !== true || plan.schema !== 'fileorbit-rename-preflight-v1') return base('blocked', { reason: 'plan-invalid', message: 'A valid Rename Map plan is required.', mutations: mutateCounts(counts) });
      if (!adapter || typeof adapter.getFileHandle !== 'function' || typeof adapter.listEntries !== 'function' || typeof adapter.createFile !== 'function' || typeof adapter.writeFile !== 'function' || typeof adapter.removeFile !== 'function') return base('blocked', { reason: 'adapter-unavailable', message: 'The filesystem adapter does not provide the required execution services.', mutations: mutateCounts(counts) });
      if (plan.kind === 'noop' || plan.noop === true) return base('noop', { ok: true, reason: null, files: await files(), mutations: mutateCounts(counts), changed: false, mutationFree: true });
      if (plan.change?.needsFilesystemRename !== true) return base('requires-in-place-save', { ok: true, reason: null, files: await files(), mutations: mutateCounts(counts), changed: false, mutationFree: true, message: 'The title changes while the filename remains the same; this requires an in-place save.' });
      if (plan.change?.caseOnlyFilenameChange || plan.change?.normalizationEquivalentFilenameChange) return base('unsupported-case-only', { reason: 'case-only-rename-unsupported', message: 'Case-only or normalization-equivalent filename changes are deferred until backend behavior is verified.', requirement: 'verified-distinct-filename', mutations: mutateCounts(counts) });
      if (!candidate || candidate.ok !== true || candidate.schema !== 'fileorbit-rename-candidate-v1' || candidate.title !== plan.title || candidate.filename !== plan.filename) return base('blocked', { reason: 'candidate-invalid', message: 'A validated candidate for this exact plan is required.', mutations: mutateCounts(counts) });
      if (!plan.baseline?.present || !plan.baseline.digest || !Number.isFinite(Number(plan.baseline.size))) return base('blocked', { reason: 'baseline-missing', message: 'A confirmed source baseline is required before rename execution.', mutations: mutateCounts(counts) });
      if (!permissions || permissions.sourceRead !== true || permissions.parentRead !== true || permissions.parentWrite !== true || permissions.sourceRemove !== true) return base('permission-required', { reason: 'permission-required', message: 'The caller must confirm read/write/remove permissions; this backend does not request permission.', mutations: mutateCounts(counts) });
      if (!current()) return base('cancelled', { reason: 'cancelled', stage: 'preflight', message: 'Rename Map was cancelled before preflight.', mutations: mutateCounts(counts) });
      if (!getState || !(await stateCurrent())) return base('stale', { reason: 'stale-ownership', stage: 'preflight', message: 'The document ownership is not current.', mutations: mutateCounts(counts) });
      if (plan.current.filename === plan.filename) return base('requires-in-place-save', { ok: true, reason: null, files: await files(), mutations: mutateCounts(counts), changed: false, mutationFree: true });

      try { candidateDigest = await digest(candidate.blob, cryptoApi); } catch { return base('verification-failed', { reason: 'candidate-hash-failed', message: 'The encoded candidate could not be hashed.', mutations: mutateCounts(counts) }); }
      if (candidate.packageSize !== candidate.blob.size) return base('blocked', { reason: 'candidate-size-mismatch', message: 'The encoded candidate size is inconsistent.', mutations: mutateCounts(counts) });

      const source = await sourceProbe();
      if (!source.present || !source.handleMatch || source.status !== 'present') return base('blocked', { reason: 'source-unverified', stage: 'source', message: 'The source file does not match the captured handle.', mutations: mutateCounts(counts) });
      if (!source.verified) return base('blocked', { reason: 'source-changed', stage: 'source', message: 'The source file changed outside FileOrbit; nothing was written.', files: await files(), mutations: mutateCounts(counts) });
      if (!current()) return base('cancelled', { reason: 'cancelled', stage: 'source', message: 'Rename Map was cancelled before destination preflight.', files: await files(), mutations: mutateCounts(counts) });
      if (!(await stateCurrent())) return base('stale', { reason: 'stale-ownership', stage: 'source', message: 'The document changed before destination preflight.', mutations: mutateCounts(counts) });

      let listing;
      try { listing = await adapter.listEntries(plan.parent.handle, { isCurrent: syncCurrent, assertCurrent }); }
      catch { return base('blocked', { reason: 'enumeration-failed', stage: 'destination', message: 'Destination enumeration failed; nothing was written.', mutations: mutateCounts(counts) }); }
      if (!listing || listing.ok !== true || !Array.isArray(listing.entries) || listing.truncated === true || listing.truncation || Number(listing.skipped) > 0) return base('blocked', { reason: 'incomplete-enumeration', stage: 'destination', message: 'The destination directory could not be conclusively enumerated; nothing was written.', mutations: mutateCounts(counts) });
      const destinationKey = String(plan.filename).normalize('NFKC').trim().toLowerCase();
      for (const entry of listing.entries) {
        if (!entry || !entry.name) continue;
        if (String(entry.name).normalize('NFKC').trim().toLowerCase() !== destinationKey) continue;
        if (await sameEntry(entry.handle, plan.current.handle)) continue;
        return base('blocked', { reason: 'destination-exists', stage: 'destination', message: 'The destination filename is already occupied; nothing was written.', existing: { name: entry.name, kind: String(entry.kind || entry.type || 'file') }, mutations: mutateCounts(counts) });
      }
      if (!current()) return base('cancelled', { reason: 'cancelled', stage: 'destination', message: 'Rename Map was cancelled before creating the new file.', mutations: mutateCounts(counts) });
      if (!(await stateCurrent()) || !syncCurrent()) return base('stale', { reason: 'stale-ownership', stage: 'destination', message: 'The document changed before creating the new file.', mutations: mutateCounts(counts) });

      let created;
      try { created = await adapter.createFile(plan.parent.handle, plan.filename, mutationCallbacks()); }
      catch (error) { created = { ok: false, reason: 'create-failed', message: String(error?.message || error) }; }
      counts.createCalls += 1;
      if (!created?.ok || !created.handle) return base('blocked', { reason: created?.reason || 'create-failed', stage: 'create', message: 'The new file could not be created; the original was not changed.', mutations: mutateCounts(counts) });
      createdHandle = created.handle;
      if (!(await stateCurrent())) return partial('partial-candidate-output', 'create', 'The new file was created, but the document changed before writing; both files may remain.', { destinationCreated: true });
      if (!current()) return partial('partial-candidate-output', 'create', 'The new file was created, then Rename Map was cancelled before writing; the original remains.', { destinationCreated: true });

      let written;
      try { written = await adapter.writeFile(created.handle, candidate.blob, mutationCallbacks()); }
      catch (error) { written = { ok: false, reason: 'write-failed', message: String(error?.message || error) }; }
      counts.writeCalls += 1;
      if (!written?.ok || written.close === false) return partial('partial-candidate-output', 'write', 'The new file was not successfully written and closed; the original remains and the new file is preserved.', { destinationCreated: true, closeFailed: written?.ok === true && written.close === false });
      if (!current()) return partial('partial-candidate-output', 'write', 'The new file was written, then Rename Map was cancelled before verification; the original remains.', { destinationCreated: true });

      let verifiedNew;
      try {
        const handle = await adapter.getFileHandle(plan.parent.handle, plan.filename);
        if (!(await sameEntry(handle, created.handle))) return partial('verification-failed', 'verify-new', 'The new file handle no longer matches the created file. Both files are preserved.', { destinationCreated: true });
        verifiedNew = await readInfo(handle, cryptoApi);
      } catch { return partial('verification-failed', 'verify-new', 'The new file could not be re-resolved for verification. Both files are preserved.', { destinationCreated: true }); }
      if (verifiedNew.size !== candidate.blob.size || verifiedNew.digest !== candidateDigest) return partial('verification-failed', 'verify-new', 'The new file bytes do not match the encoded candidate. Both files are preserved.', { destinationCreated: true });
      let decoded;
      try { decoded = await decodeBackup(verifiedNew.blob, { cryptoApi }); }
      catch { return partial('verification-failed', 'verify-new', 'The new file cannot be decoded by the package validator. Both files are preserved.', { destinationCreated: true }); }
      if (decoded?.tree?.name !== candidate.title || decoded?.manifest?.mapName !== candidate.filename) return partial('verification-failed', 'verify-new', 'The new package title or mapName does not match the candidate. Both files are preserved.', { destinationCreated: true });

      if (!current()) return partial('verified-new-original-retained', 'revalidate', 'The new file is verified, but Rename Map was cancelled before removing the original.', { destinationCreated: true, verified: true });
      if (!(await stateCurrent())) return partial('verified-new-original-retained', 'revalidate', 'The document changed after the new file was verified; the original was not removed.', { destinationCreated: true, verified: true });
      const sourceAgain = await sourceProbe();
      if (!sourceAgain.present || !sourceAgain.verified || !sourceAgain.handleMatch) return partial('verified-new-original-retained', 'revalidate', 'The original changed before removal; both files are preserved.', { destinationCreated: true, verified: true });
      const newAgain = await destinationProbe();
      if (!newAgain.present || !newAgain.handleMatch || !newAgain.verified) return partial('verified-new-original-retained', 'revalidate', 'The new file changed or disappeared before removal; both files are preserved.', { destinationCreated: newAgain.present, verified: false });

      if (!current()) return partial('verified-new-original-retained', 'remove', 'The new file is verified, but Rename Map was cancelled before removing the original.', { destinationCreated: true, verified: true });
      if (!(await stateCurrent()) || !syncCurrent()) return partial('verified-new-original-retained', 'remove', 'The document changed before removing the original; both files are preserved.', { destinationCreated: true, verified: true });
      let removed;
      try { removed = await adapter.removeFile(plan.parent.handle, plan.current.filename, { expectedHandle: sourceAgain.handle, expectedSize: sourceAgain.size, expectedLastModified: sourceAgain.lastModified, ...mutationCallbacks() }); }
      catch (error) { removed = { ok: false, reason: 'remove-failed', message: String(error?.message || error) }; }
      counts.removeCalls += 1;
      if (!removed?.ok) {
        const failedFiles = await files();
        const bothSafe = failedFiles.source.present && failedFiles.source.verified && failedFiles.destination.present && failedFiles.destination.verified;
        if (!bothSafe) return postRemovalUncertain(failedFiles, false, !current());
        return partial('verified-new-original-retained', 'remove', 'The new file is verified, but the original could not be removed. Both files remain.', { destinationCreated: true, verified: true, removalAcknowledged: false });
      }

      const finalFiles = await files();
      const sourceConfirmedAbsent = finalFiles.source.status === 'absent';
      const destinationConfirmed = finalFiles.destination.present && finalFiles.destination.handleMatch && finalFiles.destination.verified;
      const cancelledAfterRemoval = !current();
      if (!sourceConfirmedAbsent || !destinationConfirmed) return postRemovalUncertain(finalFiles, true, cancelledAfterRemoval);
      return base('filesystem-complete-adoption-required', {
        ok: true,
        reason: null,
        files: finalFiles,
        mutations: mutateCounts(counts),
        filesystemComplete: true,
        removalAcknowledged: true,
        destinationHandle: createdHandle,
        adoptionRequired: true,
        cancelledAfterRemoval,
        message: cancelledAfterRemoval ? 'The original was already removed when cancellation was observed; the disk rename is complete and adoption/reopen is required.' : 'The filesystem rename is complete; the caller must adopt or reopen the new file.'
      });
    } finally {
      inFlight = false;
    }
  }

  return { get busy() { return inFlight; }, execute };
}
