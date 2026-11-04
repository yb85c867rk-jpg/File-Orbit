import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbitDirectoryAdapter } from '../../harness/m5-exploration/orbit-directory-adapter.js';
import { createOrbitStateController } from '../../harness/m5-exploration/orbit-state.js';

const asyncTest = (name, fn) => test(name, { timeout: 5000 }, fn);

function namedError(name, message = name) { const error = new Error(message); error.name = name; return error; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fileHandle(name, { size = 1, lastModified = 0, isSameEntry = null, getFileDelay = null, getFileError = null } = {}) {
  let metadataCalls = 0; let bytesRead = 0;
  const handle = {
    name, kind: 'file',
    get metadataCalls() { return metadataCalls; },
    get bytesRead() { return bytesRead; },
    async getFile() {
      metadataCalls += 1;
      if (getFileDelay) await getFileDelay;
      if (getFileError) throw getFileError;
      return { name, size, lastModified, type: 'application/x-orbit', async arrayBuffer() { bytesRead += 1; return new ArrayBuffer(size); } };
    }
  };
  if (isSameEntry) handle.isSameEntry = isSameEntry;
  return handle;
}

function directoryHandle(name, entries = [], { permission = 'granted', requested = 'granted', queryError = null, requestError = null } = {}) {
  let queryCalls = 0; let requestCalls = 0; let yielded = 0; let returnCalls = 0; let completed = false;
  return {
    name, kind: 'directory',
    get queryCalls() { return queryCalls; },
    get requestCalls() { return requestCalls; },
    get yielded() { return yielded; },
    get returnCalls() { return returnCalls; },
    async queryPermission() { queryCalls += 1; if (queryError) throw queryError; return permission; },
    async requestPermission() { requestCalls += 1; if (requestError) throw requestError; return requested; },
    async *values() {
      try {
        for (const entry of entries) { yielded += 1; yield entry; }
        completed = true;
      } finally {
        if (!completed) returnCalls += 1;
      }
    }
  };
}

function makeState(handle, { picker = null, now = () => 1000 } = {}) {
  const window = { showDirectoryPicker: picker || (async () => handle) };
  const adapter = createOrbitDirectoryAdapter({ window, now: () => 0, maxEntries: 1000, maxDurationMs: 5000 });
  return { adapter, window, state: createOrbitStateController({ adapter, now }) };
}

asyncTest('initial snapshot is closed and empty', () => {
  const { state } = makeState(directoryHandle('Orbit'));
  const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'closed');
  assert.equal(snapshot.handle, null);
  assert.equal(snapshot.name, '');
  assert.deepEqual(snapshot.entries, []);
  assert.equal(snapshot.permission, 'unknown');
  assert.equal(snapshot.lastRefreshedAt, null);
  assert.equal(snapshot.truncated, false);
  assert.equal(snapshot.sessionId, null);
});

asyncTest('successful open adopts the directory and lists sorted top-level .map metadata', async () => {
  const old = fileHandle('old.orbit', { lastModified: 100 });
  const newer = fileHandle('Newer.orbit', { lastModified: 200 });
  const folder = directoryHandle('nested', [], {});
  const text = fileHandle('note.txt');
  const handle = directoryHandle('Maps', [text, old, folder, newer]);
  const { state } = makeState(handle);
  const result = await state.openDirectory();
  assert.equal(result.ok, true);
  assert.equal(result.adopted, true);
  const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'ready');
  assert.equal(snapshot.name, 'Maps');
  assert.equal(snapshot.handle, handle);
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['Newer.orbit', 'old.orbit']);
  assert.equal(snapshot.entries[0].lastModified, 200);
  assert.equal(snapshot.entries[1].lastModified, 100);
  assert.equal(snapshot.permission, 'granted');
  assert.equal(snapshot.lastRefreshedAt, 1000);
  assert.equal(snapshot.truncated, false);
  assert.equal(old.bytesRead, 0);
  assert.equal(text.metadataCalls, 0);
});

asyncTest('Open cancellation preserves the active Orbit and entries', async () => {
  const first = fileHandle('a.orbit', { lastModified: 1 });
  const firstHandle = directoryHandle('First', [first]);
  const { state, window } = makeState(firstHandle);
  await state.openDirectory();
  const before = state.snapshot();
  window.showDirectoryPicker = async () => { throw namedError('AbortError'); };
  const result = await state.openDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  const after = state.snapshot();
  assert.equal(after.phase, 'ready');
  assert.equal(after.name, before.name);
  assert.equal(after.handle, before.handle);
  assert.deepEqual(after.entries.map((entry) => entry.name), before.entries.map((entry) => entry.name));
});

asyncTest('Open permission denial preserves the active Orbit', async () => {
  const first = fileHandle('a.orbit');
  const firstHandle = directoryHandle('First', [first]);
  const denied = directoryHandle('Denied', [], { permission: 'denied' });
  const { state, window } = makeState(firstHandle);
  await state.openDirectory();
  const before = state.snapshot();
  window.showDirectoryPicker = async () => denied;
  const result = await state.openDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  const after = state.snapshot();
  assert.equal(after.phase, 'ready');
  assert.equal(after.name, before.name);
  assert.deepEqual(after.entries.map((entry) => entry.name), ['a.orbit']);
});

asyncTest('selection pending keeps the current Orbit and activates the picker synchronously', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const b = directoryHandle('B', [fileHandle('b.orbit')]);
  const gate = deferred(); let pickerCalls = 0;
  const { state, window } = makeState(a);
  await state.openDirectory();
  const before = state.snapshot();
  window.showDirectoryPicker = async () => { pickerCalls += 1; return gate.promise; };
  const pending = state.openDirectory();
  assert.equal(pickerCalls, 1, 'state must invoke the adapter picker before the first await');
  const opening = state.snapshot();
  assert.equal(opening.phase, 'opening');
  assert.equal(opening.handle, before.handle);
  assert.deepEqual(opening.entries.map((entry) => entry.name), ['a.orbit']);
  gate.resolve(b);
  await pending;
  assert.equal(state.snapshot().name, 'B');
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['b.orbit']);
});

asyncTest('Open A pending, Open B succeeds, then late A success cannot alter B', async () => {
  const aGate = deferred(); const bGate = deferred();
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const b = directoryHandle('B', [fileHandle('b.orbit')]);
  let calls = 0;
  const { state } = makeState(null, { picker: () => (++calls === 1 ? aGate.promise : bGate.promise) });
  const aPromise = state.openDirectory();
  const bPromise = state.openDirectory();
  bGate.resolve(b); await bPromise;
  assert.equal(state.snapshot().name, 'B');
  aGate.resolve(a); const lateA = await aPromise;
  assert.equal(lateA.ok, false);
  assert.equal(lateA.reason, 'stale');
  assert.equal(state.snapshot().name, 'B');
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['b.orbit']);
});

asyncTest('Open A pending, Open B succeeds, then late A failure cannot alter B', async () => {
  const aGate = deferred(); const bGate = deferred();
  const b = directoryHandle('B', [fileHandle('b.orbit')]);
  let calls = 0;
  const { state } = makeState(null, { picker: () => (++calls === 1 ? aGate.promise : bGate.promise) });
  const aPromise = state.openDirectory();
  const bPromise = state.openDirectory();
  bGate.resolve(b); await bPromise;
  aGate.reject(namedError('NotAllowedError')); const lateA = await aPromise;
  assert.equal(lateA.ok, false);
  assert.equal(lateA.reason, 'stale');
  assert.equal(state.snapshot().name, 'B');
});

asyncTest('refresh A pending then switching to B ignores late A success', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const b = directoryHandle('B', [fileHandle('b.orbit')]);
  const enumGate = deferred();
  const { state, window, adapter } = makeState(a);
  await state.openDirectory();
  let enumCalls = 0;
  const realEnumerate = adapter.enumerateTopLevelMaps.bind(adapter);
  adapter.enumerateTopLevelMaps = async (...args) => {
    enumCalls += 1;
    if (enumCalls === 1) return enumGate.promise;
    return realEnumerate(...args);
  };
  const refreshPromise = state.refresh();
  window.showDirectoryPicker = async () => b;
  const openB = await state.openDirectory();
  assert.equal(openB.ok, true);
  enumGate.resolve({ ok: true, entries: [fileHandle('late-a.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  const lateRefresh = await refreshPromise;
  assert.equal(lateRefresh.ok, false);
  assert.equal(lateRefresh.reason, 'stale');
  assert.equal(state.snapshot().name, 'B');
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['b.orbit']);
});

asyncTest('refresh A pending then switching to B ignores late A failure', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const b = directoryHandle('B', [fileHandle('b.orbit')]);
  const enumGate = deferred();
  const { state, window, adapter } = makeState(a);
  await state.openDirectory();
  let enumCalls = 0;
  const realEnumerate = adapter.enumerateTopLevelMaps.bind(adapter);
  adapter.enumerateTopLevelMaps = async (...args) => {
    enumCalls += 1;
    if (enumCalls === 1) return enumGate.promise;
    return realEnumerate(...args);
  };
  const refreshPromise = state.refresh();
  window.showDirectoryPicker = async () => b;
  await state.openDirectory();
  enumGate.resolve({ ok: false, reason: 'enumerate-failed', stage: 'enumerate' });
  const lateRefresh = await refreshPromise;
  assert.equal(lateRefresh.ok, false);
  assert.equal(lateRefresh.reason, 'stale');
  assert.equal(state.snapshot().name, 'B');
});

asyncTest('two refreshes completing out of order apply only the newer list', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  const first = deferred(); const second = deferred();
  let enumCalls = 0;
  adapter.enumerateTopLevelMaps = async () => {
    enumCalls += 1;
    return enumCalls === 1 ? first.promise : second.promise;
  };
  const r1 = state.refresh();
  const r2 = state.refresh();
  second.resolve({ ok: true, entries: [fileHandle('new.orbit', { lastModified: 2 })], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  await r2;
  first.resolve({ ok: true, entries: [fileHandle('old.orbit', { lastModified: 1 })], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  const old = await r1;
  assert.equal(old.ok, false);
  assert.equal(old.reason, 'stale');
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['new.orbit']);
  assert.equal(state.snapshot().phase, 'ready');
});

asyncTest('refresh failure preserves the last successful list', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  const before = state.snapshot();
  adapter.enumerateTopLevelMaps = async () => ({ ok: false, reason: 'enumerate-failed', stage: 'enumerate', message: 'offline' });
  const result = await state.refresh();
  assert.equal(result.ok, false);
  const after = state.snapshot();
  assert.equal(after.phase, 'ready');
  assert.equal(after.stale, true);
  assert.equal(after.error.reason, 'enumerate-failed');
  assert.deepEqual(after.entries.map((entry) => entry.name), before.entries.map((entry) => entry.name));
  assert.equal(after.lastRefreshedAt, before.lastRefreshedAt);
});

asyncTest('permission revocation blocks refresh and a successful retry recovers', async () => {
  const maps = [fileHandle('a.orbit')];
  const a = directoryHandle('A', maps);
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  adapter.enumerateTopLevelMaps = async () => ({ ok: false, reason: 'permission-denied', stage: 'enumerate', message: 'revoked' });
  await state.refresh();
  let snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'blocked');
  assert.equal(snapshot.permission, 'denied');
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['a.orbit']);
  adapter.enumerateTopLevelMaps = createOrbitDirectoryAdapter({ window: { showDirectoryPicker: async () => a } }).enumerateTopLevelMaps;
  const retry = await state.refresh();
  assert.equal(retry.ok, true);
  snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'ready');
  assert.notEqual(snapshot.permission, 'denied');
  assert.equal(snapshot.stale, false);
});

asyncTest('empty successful enumeration replaces the prior list with an empty list', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  adapter.enumerateTopLevelMaps = async () => ({ ok: true, entries: [], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 0, skipped: 0 });
  const result = await state.refresh();
  assert.equal(result.ok, true);
  assert.deepEqual(state.snapshot().entries, []);
  assert.equal(state.snapshot().truncated, false);
});

asyncTest('unrelated files and subdirectories are excluded by the real adapter', async () => {
  const map = fileHandle('map.orbit');
  const txt = fileHandle('readme.txt');
  const folder = directoryHandle('folder', [fileHandle('nested.orbit')]);
  const handle = directoryHandle('Mixed', [map, txt, folder]);
  const { state } = makeState(handle);
  await state.openDirectory();
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['map.orbit']);
});

asyncTest('state sorts by modification descending then deterministic case-insensitive filename', async () => {
  const handle = directoryHandle('Sorted', [
    fileHandle('z.orbit', { lastModified: 10 }),
    fileHandle('b.orbit', { lastModified: 20 }),
    fileHandle('A.orbit', { lastModified: 20 }),
    fileHandle('c.orbit', { lastModified: 10 })
  ]);
  const { state } = makeState(handle);
  await state.openDirectory();
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['A.orbit', 'b.orbit', 'c.orbit', 'z.orbit']);
});

asyncTest('truncated refresh publishes honest truncation metadata', async () => {
  const handle = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(handle);
  await state.openDirectory();
  adapter.enumerateTopLevelMaps = async () => ({
    ok: true, entries: [fileHandle('a.orbit')], truncated: true, timedOut: false,
    lookaheadLimited: true, lookaheadMatched: false, scanned: 5, skipped: 1
  });
  const result = await state.refresh();
  assert.equal(result.ok, true);
  assert.equal(state.snapshot().truncated, true);
  assert.equal(state.snapshot().truncation.reason, 'lookahead-limit');
  assert.equal(state.snapshot().truncation.scanned, 5);
  assert.equal(state.snapshot().truncation.skipped, 1);
});

asyncTest('close during picker invalidates adoption and preserves no Orbit', async () => {
  const gate = deferred();
  const handle = directoryHandle('Late', [fileHandle('a.orbit')]);
  const { state } = makeState(null, { picker: () => gate.promise });
  const pending = state.openDirectory();
  state.close();
  gate.resolve(handle);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(state.snapshot().phase, 'closed');
  assert.equal(state.snapshot().handle, null);
});

asyncTest('close during enumeration ignores the late list', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const gate = deferred();
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  adapter.enumerateTopLevelMaps = async () => gate.promise;
  const pending = state.refresh();
  state.close();
  gate.resolve({ ok: true, entries: [fileHandle('late.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(state.snapshot().phase, 'closed');
});

asyncTest('destroy during isSameEntry rejects the stale membership result', async () => {
  const gate = deferred();
  const entryFile = fileHandle('same.orbit', { isSameEntry: () => gate.promise });
  const handle = directoryHandle('A', [entryFile]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const other = fileHandle('same.orbit');
  const pending = state.matchEntry(other);
  state.destroy();
  state.destroy();
  gate.resolve(true);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(state.snapshot().phase, 'closed');
  assert.equal(state.snapshot().destroyed, true);
});

asyncTest('same filename with different handles does not match', async () => {
  const entry = fileHandle('same.orbit');
  const handle = directoryHandle('A', [entry]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const other = fileHandle('same.orbit');
  const result = await state.matchEntry(other);
  assert.equal(result.ok, true);
  assert.equal(result.matched, null);
});

asyncTest('equivalent handles match through isSameEntry', async () => {
  const other = fileHandle('other-name.orbit');
  const entry = fileHandle('entry.orbit', { isSameEntry: async (candidate) => candidate === other });
  const handle = directoryHandle('A', [entry]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const result = await state.matchEntry(other);
  assert.equal(result.ok, true);
  assert.equal(result.matched?.name, 'entry.orbit');
  assert.equal(result.index, 0);
  assert.equal(Object.isFrozen(result.matched), true);
});

asyncTest('a comparison failure does not fabricate membership or discard the list', async () => {
  const entry = fileHandle('a.orbit', { isSameEntry: async () => { throw namedError('NotAllowedError'); } });
  const handle = directoryHandle('A', [entry]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const result = await state.matchEntry(fileHandle('other.orbit'));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'comparison-failed');
  assert.equal(result.matched, null);
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['a.orbit']);
});

asyncTest('a stale isSameEntry result after refresh is rejected', async () => {
  const gate = deferred();
  const entry = fileHandle('a.orbit', { isSameEntry: () => gate.promise });
  const handle = directoryHandle('A', [entry]);
  const { state, adapter } = makeState(handle);
  await state.openDirectory();
  const pending = state.matchEntry(fileHandle('other.orbit'));
  adapter.enumerateTopLevelMaps = async () => ({ ok: true, entries: [fileHandle('b.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  await state.refresh();
  gate.resolve(true);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(result.matched, null);
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['b.orbit']);
});

asyncTest('late first-refresh rejection does not clear the newer refresh state', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(a);
  await state.openDirectory();
  const first = deferred(); const second = deferred();
  let calls = 0;
  adapter.enumerateTopLevelMaps = async () => (++calls === 1 ? first.promise : second.promise);
  const r1 = state.refresh();
  const r2 = state.refresh();
  second.resolve({ ok: true, entries: [fileHandle('new.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  await r2;
  first.resolve({ ok: false, reason: 'enumerate-failed', stage: 'enumerate' });
  const old = await r1;
  assert.equal(old.ok, false);
  assert.equal(old.reason, 'stale');
  assert.equal(state.snapshot().error, null);
  assert.equal(state.snapshot().stale, false);
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['new.orbit']);
});

asyncTest('Open B invalidates A initial enumeration; late A success is ignored and B cancellation leaves refresh usable', async () => {
  const a = directoryHandle('A', [fileHandle('late.orbit')]);
  const gate = deferred(); let enumCalls = 0;
  const { state, window, adapter } = makeState(a);
  const realEnumerate = adapter.enumerateTopLevelMaps.bind(adapter);
  adapter.enumerateTopLevelMaps = async (...args) => {
    enumCalls += 1;
    if (enumCalls === 1) return gate.promise;
    return realEnumerate(...args);
  };
  const aPromise = state.openDirectory();
  await tick();
  assert.equal(enumCalls, 1);
  const bGate = deferred();
  window.showDirectoryPicker = () => bGate.promise;
  const bPromise = state.openDirectory();
  assert.equal(state.snapshot().phase, 'opening');
  gate.resolve({ ok: true, entries: [fileHandle('late.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  const lateA = await aPromise;
  assert.equal(lateA.ok, false);
  assert.equal(lateA.reason, 'stale');
  let snapshot = state.snapshot();
  assert.equal(snapshot.name, 'A');
  assert.equal(snapshot.handle, a);
  assert.deepEqual(snapshot.entries, []);
  assert.equal(snapshot.lastRefreshedAt, null);
  bGate.reject(namedError('AbortError'));
  const bResult = await bPromise;
  assert.equal(bResult.ok, false);
  snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'blocked');
  assert.equal(snapshot.error.reason, 'listing-incomplete');
  assert.equal(snapshot.handle, a);
  assert.deepEqual(snapshot.entries, []);
  const retry = await state.refresh();
  assert.equal(retry.ok, true);
  assert.equal(state.snapshot().phase, 'ready');
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['late.orbit']);
});

asyncTest('Open B invalidates A initial enumeration; late A rejection changes nothing', async () => {
  const a = directoryHandle('A', [fileHandle('late.orbit')]);
  const gate = deferred(); let enumCalls = 0;
  const { state, window, adapter } = makeState(a);
  const realEnumerate = adapter.enumerateTopLevelMaps.bind(adapter);
  adapter.enumerateTopLevelMaps = async (...args) => {
    enumCalls += 1;
    if (enumCalls === 1) return gate.promise;
    return realEnumerate(...args);
  };
  const aPromise = state.openDirectory();
  await tick();
  const bGate = deferred();
  window.showDirectoryPicker = () => bGate.promise;
  const bPromise = state.openDirectory();
  gate.reject(namedError('NotAllowedError'));
  const lateA = await aPromise;
  assert.equal(lateA.ok, false);
  assert.equal(lateA.reason, 'stale');
  bGate.reject(namedError('AbortError'));
  await bPromise;
  const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'blocked');
  assert.equal(snapshot.error.reason, 'listing-incomplete');
  assert.deepEqual(snapshot.entries, []);
});

asyncTest('Open B invalidates a deferred refresh A while preserving the committed list', async () => {
  const a = directoryHandle('A', [fileHandle('committed.orbit')]);
  const gate = deferred();
  const { state, window, adapter } = makeState(a);
  await state.openDirectory();
  const realEnumerate = adapter.enumerateTopLevelMaps.bind(adapter);
  adapter.enumerateTopLevelMaps = async (...args) => gate.promise;
  const refreshPromise = state.refresh();
  const bGate = deferred();
  window.showDirectoryPicker = () => bGate.promise;
  const bPromise = state.openDirectory();
  gate.resolve({ ok: true, entries: [fileHandle('late-refresh.orbit')], truncated: false, timedOut: false, lookaheadLimited: false, lookaheadMatched: false, scanned: 1, skipped: 0 });
  const lateRefresh = await refreshPromise;
  assert.equal(lateRefresh.ok, false);
  assert.equal(lateRefresh.reason, 'stale');
  let snapshot = state.snapshot();
  assert.equal(snapshot.name, 'A');
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['committed.orbit']);
  bGate.reject(namedError('AbortError'));
  await bPromise;
  snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'ready');
  assert.equal(snapshot.name, 'A');
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['committed.orbit']);
  adapter.enumerateTopLevelMaps = realEnumerate;
  const retry = await state.refresh();
  assert.equal(retry.ok, true);
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['committed.orbit']);
});

asyncTest('Open B invalidates a deferred refresh A rejection; B denial leaves committed content and refresh usable', async () => {
  const a = directoryHandle('A', [fileHandle('committed.orbit')]);
  const gate = deferred();
  const { state, window, adapter } = makeState(a);
  await state.openDirectory();
  adapter.enumerateTopLevelMaps = async () => gate.promise;
  const refreshPromise = state.refresh();
  const denied = directoryHandle('B', [], { permission: 'denied' });
  window.showDirectoryPicker = async () => denied;
  const bPromise = state.openDirectory();
  gate.reject(namedError('NotAllowedError'));
  await refreshPromise;
  const bResult = await bPromise;
  assert.equal(bResult.ok, false);
  assert.equal(bResult.reason, 'permission-denied');
  const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'ready');
  assert.equal(snapshot.name, 'A');
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['committed.orbit']);
});

asyncTest('membership comparison started before a new Open becomes stale', async () => {
  const gate = deferred();
  const entry = fileHandle('a.orbit', { isSameEntry: () => gate.promise });
  const a = directoryHandle('A', [entry]);
  const { state, window } = makeState(a);
  await state.openDirectory();
  const pending = state.matchEntry(fileHandle('other.orbit'));
  const bGate = deferred();
  window.showDirectoryPicker = () => bGate.promise;
  state.openDirectory();
  gate.resolve(true);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(result.matched, null);
  assert.deepEqual(state.snapshot().entries.map((entry) => entry.name), ['a.orbit']);
});

asyncTest('returned truncation, entries, and state metadata are isolated from mutation', async () => {
  const a = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state, adapter } = makeState(a);
  adapter.enumerateTopLevelMaps = async () => ({
    ok: true, entries: [fileHandle('a.orbit')], truncated: true, timedOut: false,
    lookaheadLimited: true, lookaheadMatched: false, scanned: 3, skipped: 0
  });
  const result = await state.openDirectory();
  assert.equal(Object.isFrozen(result.truncation), true);
  assert.equal(Object.isFrozen(result.entries), true);
  assert.equal(Object.isFrozen(result.entries[0]), true);
  assert.equal(Object.isFrozen(result.state), true);
  assert.equal(Object.isFrozen(result.state.truncation), true);
  assert.throws(() => { result.truncation.reason = 'CALLER_MUTATION'; }, TypeError);
  assert.throws(() => { result.entries[0].name = 'CALLER_MUTATION'; }, TypeError);
  assert.throws(() => { result.state.entries[0].name = 'CALLER_MUTATION'; }, TypeError);
  const snapshot = state.snapshot();
  assert.equal(snapshot.truncation.reason, 'lookahead-limit');
  assert.deepEqual(snapshot.entries.map((entry) => entry.name), ['a.orbit']);
});

asyncTest('snapshots are isolated from caller mutation', async () => {
  const handle = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const first = state.snapshot();
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.entries), true);
  assert.equal(Object.isFrozen(first.entries[0]), true);
  assert.throws(() => { first.entries[0].name = 'mutated.orbit'; }, TypeError);
  assert.throws(() => { first.entries.push({ name: 'extra.orbit' }); }, TypeError);
  const second = state.snapshot();
  assert.deepEqual(second.entries.map((entry) => entry.name), ['a.orbit']);
});

asyncTest('close and destroy are idempotent', async () => {
  const handle = directoryHandle('A', [fileHandle('a.orbit')]);
  const { state } = makeState(handle);
  await state.openDirectory();
  const firstClose = state.close();
  const secondClose = state.close();
  assert.equal(firstClose.phase, 'closed');
  assert.equal(secondClose.phase, 'closed');
  const firstDestroy = state.destroy();
  const secondDestroy = state.destroy();
  assert.equal(firstDestroy.destroyed, true);
  assert.equal(secondDestroy.destroyed, true);
});

asyncTest('open enumeration failure adopts the Orbit but represents it as blocked', async () => {
  const handle = directoryHandle('Broken', []);
  const { state, adapter } = makeState(handle);
  adapter.enumerateTopLevelMaps = async () => ({ ok: false, reason: 'enumerate-failed', stage: 'enumerate', message: 'cannot list' });
  const result = await state.openDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.adopted, true);
  const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'blocked');
  assert.equal(snapshot.name, 'Broken');
  assert.equal(snapshot.handle, handle);
  assert.deepEqual(snapshot.entries, []);
});
