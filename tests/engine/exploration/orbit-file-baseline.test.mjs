import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ORBIT_BASELINE_BYTES,
  bindBaseline,
  createConfirmedWriteBaseline,
  createOpenedContentBaseline,
  createOverwriteApproval,
  preflightOverwrite,
  verifyOpenedContentBaseline
} from '../../harness/m5-exploration/orbit-file-baseline.js';

const enc = new TextEncoder();
const cryptoApi = globalThis.crypto;
const identity = 'doc-1';
const binding = { documentIdentity: identity, revision: 4, session: 9, operation: 12 };

async function hex(bytes) {
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deferred() { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));
function byteGate() { const gate = deferred(); gate.started = deferred(); return gate; }

function fileFor(bytes, { size = bytes.byteLength, lastModified = 100, getFileError = null, readError = null, getFileGate = null, readGate = null } = {}) {
  let metadataReads = 0; let byteReads = 0;
  return {
    name: 'not-used-for-identity.orbit',
    get metadataReads() { return metadataReads; },
    get byteReads() { return byteReads; },
    async getFile() {
      metadataReads += 1;
      if (getFileGate) await getFileGate;
      if (getFileError) throw getFileError;
      return {
        name: 'not-used-for-identity.orbit', size, lastModified, type: 'application/x-orbit',
        async arrayBuffer() {
          byteReads += 1;
          if (readGate) { readGate.started.resolve(); return readGate.promise; }
          if (readError) throw readError;
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        }
      };
    }
  };
}

function namedError(name) { const error = new Error(name); error.name = name; return error; }

async function openedBaseline(bytes, handle, options = {}) {
  return createOpenedContentBaseline({
    handle, bytes, observed: { size: bytes.byteLength, lastModified: options.lastModified ?? 100 },
    binding: { handle, ...binding }, cryptoApi, isCurrent: options.isCurrent || (() => true)
  });
}

test('opened-content baseline captures exact bytes and permits first protected Save without a prior write', async () => {
  const bytes = enc.encode('opened bytes'); const handle = fileFor(bytes, { lastModified: 55 });
  const created = await openedBaseline(bytes, handle, { lastModified: 55 });
  assert.equal(created.ok, true);
  const baseline = created.baseline;
  assert.equal(baseline.state, 'known');
  assert.equal(baseline.provenance, 'opened-content');
  assert.equal(baseline.digest, await hex(bytes));
  assert.equal(baseline.size, bytes.byteLength);
  assert.equal(baseline.lastModified, 55);
  assert.equal(baseline.handle, handle);
  assert.equal(baseline.documentIdentity, identity);
  assert.equal(baseline.operation, 12);
  assert.equal(Object.isFrozen(baseline), true);
  assert.equal(Object.isFrozen(handle), false);
  assert.equal('name' in baseline, false);
  const verified = await verifyOpenedContentBaseline(baseline, { cryptoApi });
  assert.equal(verified.ok, true);
  assert.equal(verified.baseline.digest, baseline.digest);
  const preflight = await preflightOverwrite({ baseline: verified.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.approved, false);
  assert.equal(preflight.scope.operation, 12);
  assert.equal(handle.byteReads, 2); // verify once + preflight once; no FileOrbit write was needed
});

test('post-install verification detects content change and never adopts the newer digest', async () => {
  const original = enc.encode('aaaa'); const changed = enc.encode('bbbb');
  const handle = fileFor(changed, { lastModified: 100 });
  const created = await openedBaseline(original, handle);
  const verified = await verifyOpenedContentBaseline(created.baseline, { cryptoApi });
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'changed');
  assert.equal(verified.baseline.state, 'changed');
  assert.equal(verified.baseline.digest, await hex(original));
  assert.equal(verified.baseline.verification.digest, await hex(changed));
  const preflight = await preflightOverwrite({ baseline: verified.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.reason, 'conflict');
  assert.equal(preflight.conflict.observation.digest, await hex(changed));
});

test('metadata change gates overwrite without hashing destination bytes', async () => {
  const bytes = enc.encode('same');
  const handle = fileFor(bytes, { lastModified: 101 });
  const created = await openedBaseline(bytes, handle, { lastModified: 100 });
  const verified = await verifyOpenedContentBaseline(created.baseline, { cryptoApi });
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'changed');
  assert.equal(handle.byteReads, 0);
});

test('missing destination is actionable and performs no content read', async () => {
  const bytes = enc.encode('x'); const handle = fileFor(bytes);
  const created = await openedBaseline(bytes, handle);
  handle.getFile = async () => { throw namedError('NotFoundError'); };
  const result = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
  assert.equal(result.actionable, true);
});

test('opened verification read and hash failures become unknown/observed without throwing', async () => {
  const bytes = enc.encode('x');
  const denied = fileFor(bytes, { getFileError: namedError('NotAllowedError') });
  const created = await openedBaseline(bytes, denied);
  const readFailed = await verifyOpenedContentBaseline(created.baseline, { cryptoApi });
  assert.equal(readFailed.ok, false);
  assert.equal(readFailed.baseline.state, 'unknown');
  assert.equal(readFailed.verificationFailed, true);

  const broken = fileFor(bytes, { readError: new Error('read fail') });
  const hashCreated = await openedBaseline(bytes, broken);
  const hashFailed = await verifyOpenedContentBaseline(hashCreated.baseline, { cryptoApi });
  assert.equal(hashFailed.ok, false);
  assert.equal(hashFailed.baseline.state, 'observed');
  assert.equal(hashFailed.verificationFailed, true);
});

test('confirmed-write baseline compares actual file and uses observed filesystem timestamp', async () => {
  const bytes = enc.encode('written');
  const handle = fileFor(bytes, { lastModified: 77 });
  const created = await createConfirmedWriteBaseline({
    handle, writtenBytes: bytes, binding: { handle, ...binding }, cryptoApi
  });
  assert.equal(created.ok, true);
  assert.equal(created.baseline.state, 'known');
  assert.equal(created.baseline.provenance, 'confirmed-write');
  assert.equal(created.baseline.digest, await hex(bytes));
  assert.equal(created.baseline.lastModified, 77, 'must not fabricate timestamp from encoded bytes');
});

test('confirmed-write digest mismatch is changed and does not claim rollback', async () => {
  const written = enc.encode('aaaa'); const actual = enc.encode('bbbb');
  const handle = fileFor(actual, { lastModified: 200 });
  const result = await createConfirmedWriteBaseline({
    handle, writtenBytes: written, binding: { handle, ...binding }, cryptoApi
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'changed');
  assert.equal(result.verificationFailed, true);
  assert.equal(result.baseline.state, 'changed');
  assert.equal(result.baseline.digest, await hex(written));
  assert.equal(result.baseline.verification.digest, await hex(actual));
});

test('post-close baseline read failure preserves write semantics and leaves baseline unknown', async () => {
  const written = enc.encode('written'); const handle = fileFor(written);
  handle.getFile = async () => { throw namedError('NotFoundError'); };
  let savedRevision = 5;
  const result = await createConfirmedWriteBaseline({
    handle, writtenBytes: written, binding: { handle, ...binding }, cryptoApi
  });
  assert.equal(result.ok, false);
  assert.equal(result.verificationFailed, true);
  assert.equal(result.baseline.state, 'unknown');
  assert.equal(result.baseline.digest, await hex(written));
  assert.equal(savedRevision, 5, 'baseline failure must not roll back the already-successful save revision');
});

test('baseline size limits are checked before reading large destination content', async () => {
  const bytes = enc.encode('abc');
  const handle = fileFor(bytes, { size: 3, lastModified: 1 });
  const created = await openedBaseline(bytes, handle);
  handle.getFile = async () => ({
    size: 3, lastModified: 1, type: 'application/x-orbit',
    async arrayBuffer() { throw new Error('must not read'); }
  });
  const result = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, limits: { maxBytes: 2 }, cryptoApi });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'size-limit');
});

test('opened and written byte limits reject before hashing', async () => {
  const bytes = enc.encode('abcd');
  const handle = fileFor(bytes);
  const opened = await createOpenedContentBaseline({
    handle, bytes, observed: { size: 4, lastModified: 1 }, binding: { handle, ...binding }, limits: { maxBytes: 2 }, cryptoApi
  });
  assert.equal(opened.ok, false);
  assert.equal(opened.reason, 'size-limit');
  const written = await createConfirmedWriteBaseline({
    handle, writtenBytes: bytes, binding: { handle, ...binding }, limits: { maxBytes: 2 }, cryptoApi
  });
  assert.equal(written.ok, false);
  assert.equal(written.reason, 'size-limit');
});

test('stale opened and confirmed-write results do not produce baselines', async () => {
  const bytes = enc.encode('stale');
  const handle = fileFor(bytes);
  let calls = 0;
  const opened = await createOpenedContentBaseline({
    handle, bytes, observed: { size: bytes.byteLength, lastModified: 1 }, binding: { handle, ...binding }, cryptoApi,
    isCurrent: () => ++calls < 2
  });
  assert.equal(opened.ok, false);
  assert.equal(opened.reason, 'stale');
  let writeCalls = 0;
  const written = await createConfirmedWriteBaseline({
    handle, writtenBytes: bytes, binding: { handle, ...binding }, cryptoApi,
    isCurrent: () => ++writeCalls < 3
  });
  assert.equal(written.ok, false);
  assert.equal(written.reason, 'stale');
});

test('unbound baselines cannot authorize overwrite', async () => {
  const bytes = enc.encode('unbound'); const handle = fileFor(bytes);
  const created = await createOpenedContentBaseline({ handle, bytes, observed: { size: bytes.byteLength, lastModified: 1 }, cryptoApi });
  assert.equal(created.ok, true);
  const result = await preflightOverwrite({ baseline: created.baseline, handle, cryptoApi });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unbound-baseline');
});

test('wrong handle/document/operation and invalid approval are rejected', async () => {
  const bytes = enc.encode('safe'); const handle = fileFor(bytes);
  const created = await openedBaseline(bytes, handle);
  const other = fileFor(bytes);
  assert.equal((await preflightOverwrite({ baseline: created.baseline, handle: other, documentIdentity: identity, cryptoApi })).reason, 'handle-mismatch');
  assert.equal((await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: 'other', cryptoApi })).reason, 'identity-mismatch');
  handle.getFile = fileFor(enc.encode('saf3'), { lastModified: 100 }).getFile;
  const conflict = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  const approval = createOverwriteApproval({ ...conflict.conflict, handle: other });
  assert.equal(approval.ok, true);
  const rejected = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, approval: approval.approval, cryptoApi });
  assert.equal(rejected.reason, 'approval-mismatch');
});

test('explicit overwrite approval is bound to the captured conflict and becomes stale after a material change', async () => {
  const original = enc.encode('aaaa'); const changed = enc.encode('bbbb');
  const handle = fileFor(original, { lastModified: 10 });
  const created = await openedBaseline(original, handle, { lastModified: 10 });
  handle.getFile = fileFor(changed, { lastModified: 11 }).getFile;
  const conflict = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(conflict.reason, 'conflict');
  const approvalResult = createOverwriteApproval(conflict.conflict);
  assert.equal(approvalResult.ok, true);
  assert.equal(Object.isFrozen(approvalResult.approval.observation), true);

  const approved = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, approval: approvalResult.approval, cryptoApi });
  assert.equal(approved.ok, true);
  assert.equal(approved.approved, true);

  const material = enc.encode('cccc');
  handle.getFile = fileFor(material, { lastModified: 11 }).getFile;
  const stale = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, approval: approvalResult.approval, cryptoApi });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'approval-stale');
});

test('stale post-open verification is discarded without changing the baseline', async () => {
  const bytes = enc.encode('stale verify');
  const handle = fileFor(bytes);
  const created = await openedBaseline(bytes, handle);
  let current = true;
  handle.getFile = async () => { const file = await fileFor(bytes).getFile(); current = false; return file; };
  const verified = await verifyOpenedContentBaseline(created.baseline, { cryptoApi, isCurrent: () => current });
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'stale');
  assert.equal(verified.stale, true);
  assert.equal(verified.baseline, undefined);
});

test('confirmed-write hash failure leaves an observed/unknown baseline and never claims verification', async () => {
  const written = enc.encode('written');
  const broken = {
    async getFile() {
      return {
        size: written.byteLength, lastModified: 9, type: 'application/x-orbit',
        async arrayBuffer() { throw new Error('read failed'); }
      };
    }
  };
  const result = await createConfirmedWriteBaseline({
    handle: broken, writtenBytes: written, binding: { handle: broken, ...binding }, cryptoApi
  });
  assert.equal(result.ok, false);
  assert.equal(result.verificationFailed, true);
  assert.equal(result.baseline.state, 'observed');
  assert.equal(result.baseline.digest, await hex(written));
});

test('approval for another operation or document identity is rejected', async () => {
  const bytes = enc.encode('scope'); const handle = fileFor(bytes);
  const created = await openedBaseline(bytes, handle);
  const conflict = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  // A known baseline is safe, so produce a conflict by changing the file.
  handle.getFile = fileFor(enc.encode('scop3'), { lastModified: 100 }).getFile;
  const changed = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(changed.reason, 'conflict');
  const approval = createOverwriteApproval(changed.conflict);
  assert.equal(approval.ok, true);
  const wrongOperation = await preflightOverwrite({
    baseline: created.baseline, handle, documentIdentity: identity,
    approval: { ...approval.approval, operation: 99 }, cryptoApi
  });
  assert.equal(wrongOperation.reason, 'approval-mismatch');
  const wrongIdentity = await preflightOverwrite({
    baseline: created.baseline, handle, documentIdentity: identity,
    approval: { ...approval.approval, documentIdentity: 'other' }, cryptoApi
  });
  assert.equal(wrongIdentity.reason, 'approval-mismatch');
});

test('an unverifiable conflict cannot produce reusable overwrite approval', async () => {
  const original = enc.encode('aaaa'); const changed = enc.encode('bbbb');
  const handle = fileFor(original, { lastModified: 10 });
  const created = await openedBaseline(original, handle, { lastModified: 10 });
  handle.getFile = async () => { throw namedError('NotAllowedError'); };
  const unknown = await verifyOpenedContentBaseline(created.baseline, { cryptoApi });
  assert.equal(unknown.baseline.state, 'unknown');

  handle.getFile = fileFor(changed, { lastModified: 10, readError: new Error('hash unavailable') }).getFile;
  const unverifiable = await preflightOverwrite({ baseline: unknown.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(unverifiable.ok, false);
  assert.equal(unverifiable.reason, 'unverifiable');
  assert.equal(unverifiable.unverifiable, true);
  assert.equal(unverifiable.conflict, undefined);
  assert.deepEqual(unverifiable.allowedDecisions, ['copy', 'cancel']);

  const refused = createOverwriteApproval({ handle, documentIdentity: identity, operation: 12, observation: { size: changed.byteLength, lastModified: 10, digest: null } });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'unverifiable');
  assert.equal(refused.approval, undefined);
});

test('a forged approval without content cannot authorize changed same-size/same-time content', async () => {
  const original = enc.encode('aaaa'); const changed = enc.encode('bbbb');
  const handle = fileFor(original, { lastModified: 10 });
  const created = await openedBaseline(original, handle, { lastModified: 10 });
  handle.getFile = fileFor(changed, { lastModified: 10 }).getFile;
  const forged = { handle, documentIdentity: identity, operation: 12, observation: { size: 4, lastModified: 10, digest: null } };
  const fresh = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, approval: forged, cryptoApi });
  assert.equal(fresh.ok, false);
  assert.equal(fresh.reason, 'conflict');
  assert.equal(fresh.requiresNewDecision, true);
  assert.equal(fresh.conflict.observation.digest, await hex(changed));
  assert.equal(fresh.approval, undefined);
});

test('fresh readable observation requires a new decision and known-digest approval detects later change', async () => {
  const original = enc.encode('aaaa'); const changed = enc.encode('bbbb');
  const later = enc.encode('cccc');
  const handle = fileFor(original, { lastModified: 10 });
  const created = await openedBaseline(original, handle, { lastModified: 10 });
  handle.getFile = fileFor(changed, { lastModified: 10 }).getFile;
  const conflict = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(conflict.reason, 'conflict');
  const approval = createOverwriteApproval(conflict.conflict);
  assert.equal(approval.ok, true);
  assert.equal(approval.approval.observation.digest, await hex(changed));
  handle.getFile = fileFor(later, { lastModified: 10 }).getFile;
  const stale = await preflightOverwrite({ baseline: created.baseline, handle, documentIdentity: identity, approval: approval.approval, cryptoApi });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'approval-stale');
});

test('stale initial hashing failures return stale without a baseline', async () => {
  const bytes = enc.encode('initial hash');
  const handle = fileFor(bytes);
  const gate = deferred();
  const gatedCrypto = { subtle: { digest: () => gate.promise } };
  let current = true;
  const openedPending = createOpenedContentBaseline({
    handle, bytes, observed: { size: bytes.byteLength, lastModified: 1 },
    binding: { handle, ...binding }, cryptoApi: gatedCrypto, isCurrent: () => current
  });
  await tick();
  current = false;
  gate.reject(new Error('digest failed'));
  const openedStale = await openedPending;
  assert.equal(openedStale.reason, 'stale');
  assert.equal(openedStale.baseline, undefined);

  const writeGate = deferred();
  let writeCurrent = true;
  const writtenPending = createConfirmedWriteBaseline({
    handle, writtenBytes: bytes, binding: { handle, ...binding },
    cryptoApi: { subtle: { digest: () => writeGate.promise } }, isCurrent: () => writeCurrent
  });
  await tick();
  writeCurrent = false;
  writeGate.reject(new Error('written digest failed'));
  const writtenStale = await writtenPending;
  assert.equal(writtenStale.reason, 'stale');
  assert.equal(writtenStale.baseline, undefined);
});

test('stale Open verification read/hash failures return stale without a baseline', async () => {
  const bytes = enc.encode('stale open');
  const getGate = deferred();
  const getHandle = fileFor(bytes);
  const getBaseline = await openedBaseline(bytes, getHandle);
  getHandle.getFile = () => getGate.promise;
  let current = true;
  const pendingGet = verifyOpenedContentBaseline(getBaseline.baseline, { cryptoApi, isCurrent: () => current });
  await tick();
  current = false;
  getGate.reject(namedError('NotAllowedError'));
  const staleGet = await pendingGet;
  assert.equal(staleGet.reason, 'stale');
  assert.equal(staleGet.stale, true);
  assert.equal(staleGet.baseline, undefined);

  const readGate = byteGate();
  const readHandle = fileFor(bytes, { readGate });
  const readBaseline = await openedBaseline(bytes, readHandle);
  let currentRead = true;
  const pendingRead = verifyOpenedContentBaseline(readBaseline.baseline, { cryptoApi, isCurrent: () => currentRead });
  await readGate.started.promise;
  currentRead = false;
  readGate.reject(new Error('hash failed'));
  const staleRead = await pendingRead;
  assert.equal(staleRead.reason, 'stale');
  assert.equal(staleRead.baseline, undefined);
});

test('stale confirmed-write read/hash failures return stale without a baseline', async () => {
  const bytes = enc.encode('stale write');
  const getGate = deferred(); const getStarted = deferred();
  const getHandle = fileFor(bytes);
  getHandle.getFile = () => { getStarted.resolve(); return getGate.promise; };
  let current = true;
  const pendingGet = createConfirmedWriteBaseline({ handle: getHandle, writtenBytes: bytes, binding: { handle: getHandle, ...binding }, cryptoApi, isCurrent: () => current });
  await getStarted.promise;
  current = false;
  getGate.reject(namedError('NotAllowedError'));
  const staleGet = await pendingGet;
  assert.equal(staleGet.reason, 'stale');
  assert.equal(staleGet.baseline, undefined);

  const readGate = byteGate();
  const readHandle = fileFor(bytes, { readGate });
  let currentRead = true;
  const pendingRead = createConfirmedWriteBaseline({ handle: readHandle, writtenBytes: bytes, binding: { handle: readHandle, ...binding }, cryptoApi, isCurrent: () => currentRead });
  await readGate.started.promise;
  currentRead = false;
  readGate.reject(new Error('hash failed'));
  const staleRead = await pendingRead;
  assert.equal(staleRead.reason, 'stale');
  assert.equal(staleRead.baseline, undefined);
});

test('stale preflight read/hash failures return stale without conflict or approval', async () => {
  const bytes = enc.encode('preflight');
  const getGate = deferred();
  const getHandle = fileFor(bytes);
  const baseline = await openedBaseline(bytes, getHandle);
  getHandle.getFile = () => getGate.promise;
  let current = true;
  const pendingGet = preflightOverwrite({ baseline: baseline.baseline, handle: getHandle, documentIdentity: identity, cryptoApi, isCurrent: () => current });
  await tick();
  current = false;
  getGate.reject(namedError('NotAllowedError'));
  const staleGet = await pendingGet;
  assert.equal(staleGet.reason, 'stale');
  assert.equal(staleGet.conflict, undefined);
  assert.equal(staleGet.baseline, undefined);
  assert.equal(staleGet.approval, undefined);

  const readGate = byteGate();
  const readHandle = fileFor(bytes, { readGate });
  const readBaseline = await openedBaseline(bytes, readHandle);
  let currentRead = true;
  const pendingRead = preflightOverwrite({ baseline: readBaseline.baseline, handle: readHandle, documentIdentity: identity, cryptoApi, isCurrent: () => currentRead });
  await readGate.started.promise;
  currentRead = false;
  readGate.reject(new Error('hash failed'));
  const staleRead = await pendingRead;
  assert.equal(staleRead.reason, 'stale');
  assert.equal(staleRead.conflict, undefined);
  assert.equal(staleRead.baseline, undefined);
});

test('returned baseline/verification/conflict metadata is isolated while native handles retain identity', async () => {
  const bytes = enc.encode('isolate'); const handle = fileFor(bytes);
  const created = await openedBaseline(bytes, handle);
  assert.equal(Object.isFrozen(created.baseline), true);
  assert.throws(() => { created.baseline.digest = 'CALLER'; }, TypeError);
  assert.equal(created.baseline.handle, handle);
  assert.equal(Object.isFrozen(handle), false);

  const changed = enc.encode('isolatf');
  handle.getFile = fileFor(changed).getFile;
  const verified = await verifyOpenedContentBaseline(created.baseline, { cryptoApi });
  assert.equal(verified.reason, 'changed');
  assert.equal(Object.isFrozen(verified.baseline.verification), true);
  assert.throws(() => { verified.baseline.verification.digest = 'CALLER'; }, TypeError);

  const conflict = await preflightOverwrite({ baseline: verified.baseline, handle, documentIdentity: identity, cryptoApi });
  assert.equal(Object.isFrozen(conflict.conflict), true);
  assert.equal(Object.isFrozen(conflict.conflict.observation), true);
  assert.throws(() => { conflict.conflict.observation.size = -1; }, TypeError);
});

test('bindBaseline updates document identity without changing the authoritative digest', async () => {
  const bytes = enc.encode('bind'); const handle = fileFor(bytes);
  const created = await createOpenedContentBaseline({ handle, bytes, observed: { size: bytes.byteLength, lastModified: 1 }, cryptoApi });
  const bound = bindBaseline(created.baseline, { handle, documentIdentity: 'late-doc', revision: 2, session: 3, operation: 4 });
  assert.equal(bound.ok, true);
  assert.equal(bound.baseline.digest, created.baseline.digest);
  assert.equal(bound.baseline.documentIdentity, 'late-doc');
  assert.equal(bound.baseline.handle, handle);
  assert.equal(Object.isFrozen(bound.baseline), true);
});

test('MAX_ORBIT_BASELINE_BYTES is derived from the existing package limits', () => {
  assert.ok(MAX_ORBIT_BASELINE_BYTES > 100 * 1024 * 1024);
});
