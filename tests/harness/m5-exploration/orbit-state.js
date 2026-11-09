/**
 * Isolated Orbit state controller for Slice 2.
 *
 * It owns directory-selection, metadata-list, permission, and stale-request
 * state only. It does not read document bytes, edit maps, adopt documents, or
 * touch recovery/editor/history/activeDocument state.
 */
function normalizedError(result) {
  if (!result) return { reason: 'unknown', stage: 'operation', message: 'Map Library operation failed.' };
  return {
    reason: String(result.reason || 'unknown'),
    stage: String(result.stage || 'operation'),
    message: String(result.message || result.errorMessage || result.errorName || 'Map Library operation failed.'),
    errorName: String(result.errorName || ''),
    errorMessage: String(result.errorMessage || '')
  };
}

function failure(reason, stage, message = '') {
  return { ok: false, reason, stage, message };
}

function truncationFor(result) {
  if (!result?.truncated) return null;
  const reason = result.timedOut ? 'time' : result.lookaheadMatched ? 'next-map' : result.lookaheadLimited ? 'lookahead-limit' : 'limit';
  return {
    reason,
    timedOut: Boolean(result.timedOut),
    lookaheadLimited: Boolean(result.lookaheadLimited),
    lookaheadMatched: Boolean(result.lookaheadMatched),
    scanned: Number(result.scanned) || 0,
    skipped: Number(result.skipped) || 0
  };
}

function compareNames(left, right) {
  const a = String(left || '').normalize('NFC').toLowerCase();
  const b = String(right || '').normalize('NFC').toLowerCase();
  if (a < b) return -1;
  if (a > b) return 1;
  const an = String(left || '').normalize('NFC');
  const bn = String(right || '').normalize('NFC');
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function sortEntries(list) {
  return list
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const byModified = (Number(right.entry.lastModified) || 0) - (Number(left.entry.lastModified) || 0);
      if (byModified) return byModified;
      const byName = compareNames(left.entry.name, right.entry.name);
      if (byName) return byName;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function freezeSnapshot(snapshot) {
  return Object.freeze(snapshot);
}

export function createOrbitStateController({ adapter, now = () => Date.now() } = {}) {
  if (!adapter || typeof adapter.pickDirectory !== 'function' || typeof adapter.enumerateTopLevelMaps !== 'function') {
    throw new TypeError('Orbit state requires a directory adapter with pickDirectory and enumerateTopLevelMaps.');
  }

  let destroyed = false;
  let phase = 'closed';
  let settledPhase = 'closed';
  let handle = null;
  let name = '';
  let permission = 'unknown';
  let entries = [];
  let truncated = false;
  let truncation = null;
  let stale = false;
  let lastRefreshedAt = null;
  let error = null;
  let sessionSeq = 0;
  let activeSession = null;
  let requestSeq = 0;
  let entryKeySeq = 0;
  let openRequest = null;
  let listRequest = null;
  let hasSuccessfulList = false;

  const currentList = (request) => Boolean(request && !destroyed
    && listRequest === request
    && activeSession === request.session
    && handle === request.handle);

  const buildEntries = (result) => {
    const prefix = activeSession;
    return sortEntries((result.entries || []).map((entry) => ({
      key: `${prefix}:${++entryKeySeq}`,
      name: String(entry.name || ''),
      size: Number(entry.size) || 0,
      lastModified: Number(entry.lastModified) || 0,
      type: String(entry.type || ''),
      handle: entry.handle
    })));
  };

  const publicTruncation = () => truncation ? Object.freeze({ ...truncation }) : null;

  const snapshot = () => freezeSnapshot({
    phase,
    settledPhase,
    destroyed,
    handle,
    name,
    permission,
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
    truncated,
    truncation: publicTruncation(),
    stale,
    lastRefreshedAt,
    error: error ? Object.freeze({ ...error }) : null,
    sessionId: activeSession,
    requestId: listRequest?.id ?? null
  });

  const setListFailure = (request, result) => {
    const normalized = normalizedError(result);
    error = normalized;
    stale = true;
    if (result?.reason === 'permission-denied') permission = 'denied';
    const next = (result?.reason === 'permission-denied' || !hasSuccessfulList) ? 'blocked' : 'ready';
    settledPhase = next;
    phase = openRequest ? 'opening' : next;
    return { ...failure(result?.reason || 'enumerate-failed', result?.stage || 'enumerate', normalized.message), adopted: request.kind === 'open', state: snapshot() };
  };

  const applyList = (request, result) => {
    if (!currentList(request)) return { ok: false, reason: 'stale', stale: true, stage: 'enumerate', state: snapshot() };
    if (!result || result.ok !== true) return setListFailure(request, result);
    entries = buildEntries(result);
    truncated = Boolean(result.truncated);
    truncation = truncationFor(result);
    stale = false;
    error = null;
    if (permission === 'denied' || permission === 'unknown') permission = 'unknown';
    hasSuccessfulList = true;
    lastRefreshedAt = now();
    settledPhase = 'ready';
    phase = openRequest ? 'opening' : 'ready';
    return {
      ok: true,
      adopted: request.kind === 'open',
      entries: snapshot().entries,
      truncated,
      truncation: publicTruncation(),
      state: snapshot()
    };
  };

  const runList = async (request) => {
    let result;
    try {
      result = await adapter.enumerateTopLevelMaps(request.handle, {
        token: request.id,
        isCurrent: () => currentList(request)
      });
    } catch (err) {
      result = { ok: false, reason: 'enumerate-failed', stage: 'enumerate', error: err, errorName: String(err?.name || ''), errorMessage: String(err?.message || err) };
    }
    if (!currentList(request)) return { ok: false, reason: 'stale', stale: true, stage: 'enumerate', state: snapshot() };
    if (result?.stale || result?.reason === 'stale') return { ok: false, reason: 'stale', stale: true, stage: 'enumerate', state: snapshot() };
    return applyList(request, result);
  };

  async function openDirectory({ mode = 'readwrite' } = {}) {
    if (destroyed) return { ...failure('destroyed', 'open', 'The Map Library connection was closed.'), state: snapshot() };
    const request = { id: ++requestSeq, kind: 'open' };
    openRequest = request;
    listRequest = null;
    phase = 'opening';
    // The adapter invokes showDirectoryPicker synchronously before its first await.
    const pickPromise = adapter.pickDirectory({ mode });
    let picked;
    try { picked = await pickPromise; }
    catch (err) {
      picked = { ok: false, reason: 'picker-failed', stage: 'picker', error: err, errorName: String(err?.name || ''), errorMessage: String(err?.message || err) };
    }
    if (destroyed || openRequest !== request) return { ok: false, reason: 'stale', stale: true, stage: 'open', state: snapshot() };
    if (!picked || picked.ok !== true) {
      openRequest = null;
      if (settledPhase === 'listing' && !hasSuccessfulList) {
        settledPhase = 'blocked';
        phase = 'blocked';
        error = { reason: 'listing-incomplete', stage: 'open', message: 'FileOrbit opened the folder, but couldn’t list its files. Choose Refresh to try again.', errorName: '', errorMessage: '' };
        stale = true;
      } else {
        phase = settledPhase;
      }
      if (activeSession && handle) {
        listRequest = { id: ++requestSeq, kind: 'retained', session: activeSession, handle };
      }
      return { ...(picked || failure('picker-failed', 'picker')), state: snapshot() };
    }

    activeSession = ++sessionSeq;
    handle = picked.handle;
    name = String(picked.name || picked.handle?.name || '');
    permission = String(picked.permission || 'granted');
    entries = [];
    truncated = false;
    truncation = null;
    stale = false;
    lastRefreshedAt = null;
    error = null;
    hasSuccessfulList = false;
    settledPhase = 'listing';
    phase = 'listing';
    openRequest = null;
    const listing = { id: ++requestSeq, kind: 'open', session: activeSession, handle };
    listRequest = listing;
    return runList(listing);
  }

  function restoreDirectory(nextHandle, { name: nextName = '', permission: nextPermission = 'prompt', enumerate = false } = {}) {
    if (destroyed) return { ...failure('destroyed', 'restore', 'The Map Library connection was closed.'), state: snapshot() };
    if (!nextHandle || typeof nextHandle.values !== 'function') return { ...failure('invalid-handle', 'restore', 'Choose a folder first.'), state: snapshot() };
    openRequest = null;
    listRequest = null;
    activeSession = ++sessionSeq;
    handle = nextHandle;
    name = String(nextName || nextHandle.name || '');
    permission = String(nextPermission || 'prompt');
    entries = [];
    truncated = false;
    truncation = null;
    stale = false;
    lastRefreshedAt = null;
    hasSuccessfulList = false;
    if (enumerate && permission === 'granted') {
      error = null;
      settledPhase = 'listing';
      phase = 'listing';
      const listing = { id: ++requestSeq, kind: 'restore', session: activeSession, handle };
      listRequest = listing;
      return runList(listing);
    }
    const reason = permission === 'denied' ? 'permission-denied' : 'permission-required';
    error = {
      reason,
      stage: 'restore',
      message: reason === 'permission-denied'
        ? 'FileOrbit can’t read this folder. Choose Reconnect Map Library to restore access.'
        : 'FileOrbit needs permission to open this folder again. Choose Reconnect Map Library and allow access in the browser prompt.',
      errorName: '', errorMessage: ''
    };
    settledPhase = 'blocked';
    phase = 'blocked';
    return { ok: false, reason, stage: 'restore', message: error.message, state: snapshot() };
  }
  async function adoptDirectory(nextHandle, { name: nextName = '', permission: nextPermission = 'granted' } = {}) {
    if (destroyed) return { ...failure('destroyed', 'open', 'The Map Library connection was closed.'), state: snapshot() };
    if (!nextHandle || typeof nextHandle.values !== 'function') return { ...failure('invalid-handle', 'open', 'Choose a folder first.'), state: snapshot() };
    const request = { id: ++requestSeq, kind: 'open' };
    openRequest = request;
    listRequest = null;
    phase = 'opening';
    activeSession = ++sessionSeq;
    handle = nextHandle;
    name = String(nextName || nextHandle.name || '');
    permission = String(nextPermission || 'granted');
    entries = [];
    truncated = false;
    truncation = null;
    stale = false;
    lastRefreshedAt = null;
    error = null;
    hasSuccessfulList = false;
    settledPhase = 'listing';
    phase = 'listing';
    openRequest = null;
    const listing = { id: ++requestSeq, kind: 'open', session: activeSession, handle: nextHandle };
    listRequest = listing;
    return runList(listing);
  }

  async function refresh() {
    if (destroyed) return { ...failure('destroyed', 'refresh', 'The Map Library connection was closed.'), state: snapshot() };
    if (!handle || !activeSession) return { ...failure('no-orbit', 'refresh', 'No Map Library folder is connected.'), state: snapshot() };
    if (phase === 'opening') return { ...failure('busy', 'refresh', 'A folder is already being chosen.'), state: snapshot() };
    const request = { id: ++requestSeq, kind: 'refresh', session: activeSession, handle };
    listRequest = request;
    phase = 'listing';
    return runList(request);
  }

  async function matchEntry(fileHandle) {
    if (destroyed) return { ok: false, reason: 'destroyed', matched: null, state: snapshot() };
    if (!handle || !activeSession) return { ok: false, reason: 'no-orbit', matched: null, state: snapshot() };
    if (!fileHandle) return { ok: false, reason: 'invalid-handle', matched: null, state: snapshot() };
    const request = listRequest;
    const capturedSession = activeSession;
    const capturedEntries = entries;
    const current = () => !destroyed && activeSession === capturedSession && listRequest === request && entries === capturedEntries;
    for (let index = 0; index < capturedEntries.length; index += 1) {
      const entry = capturedEntries[index];
      if (entry.handle === fileHandle) {
        if (!current()) return { ok: false, reason: 'stale', matched: null, state: snapshot() };
        return { ok: true, matched: Object.freeze({ ...entry }), index, state: snapshot() };
      }
      if (typeof entry.handle?.isSameEntry === 'function') {
        let same;
        try { same = await entry.handle.isSameEntry(fileHandle); }
        catch (err) {
          return { ok: false, reason: 'comparison-failed', matched: null, errorName: String(err?.name || ''), errorMessage: String(err?.message || err), state: snapshot() };
        }
        if (!current()) return { ok: false, reason: 'stale', matched: null, state: snapshot() };
        if (same) return { ok: true, matched: Object.freeze({ ...entry }), index, state: snapshot() };
      }
    }
    if (!current()) return { ok: false, reason: 'stale', matched: null, state: snapshot() };
    return { ok: true, matched: null, index: -1, state: snapshot() };
  }

  function setDirectoryName(nextName) {
    const value = String(nextName || '').trim();
    if (value) name = value;
    return snapshot();
  }

  function markUnavailable(reason, message) {
    error = { reason: String(reason || 'unavailable'), stage: 'enumerate', message: String(message || ''), errorName: '', errorMessage: '' };
    stale = true;
    settledPhase = 'blocked';
    phase = openRequest ? 'opening' : 'blocked';
    return snapshot();
  }
  function close() {
    openRequest = null;
    listRequest = null;
    sessionSeq += 1;
    activeSession = null;
    handle = null;
    name = '';
    permission = 'unknown';
    entries = [];
    truncated = false;
    truncation = null;
    stale = false;
    lastRefreshedAt = null;
    error = null;
    hasSuccessfulList = false;
    settledPhase = 'closed';
    phase = 'closed';
    return snapshot();
  }

  function destroy() {
    if (destroyed) return snapshot();
    close();
    destroyed = true;
    return snapshot();
  }

  return { openDirectory, adoptDirectory, restoreDirectory, refresh, matchEntry, setDirectoryName, markUnavailable, close, destroy, snapshot };
}





