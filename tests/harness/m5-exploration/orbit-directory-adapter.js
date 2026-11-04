import { findOrbitNameCollision, normalizeOrbitMapFilename, validateOrbitDirectoryName } from '../../../src/engine/hypertree/orbit/names.js';

export const DEFAULT_MAX_ORBIT_ENTRIES = 1000;
export const DEFAULT_MAX_ENUMERATION_MS = 5000;
export const DEFAULT_LOOKAHEAD_ENTRIES = 100;
export const DEFAULT_PREFLIGHT_ENTRIES = 1000;
export const DEFAULT_PREFLIGHT_MS = 500;

function failure(reason, stage, error = null, message = '') {
  return {
    ok: false,
    reason,
    stage,
    error,
    errorName: String(error?.name || ''),
    errorMessage: String(error?.message || ''),
    message: message || String(error?.message || '')
  };
}

function stale(stage = 'enumerate') {
  return { ok: false, reason: 'stale', stale: true, stage };
}

function isAbort(error) { return error?.name === 'AbortError'; }
function isDenied(error) { return error?.name === 'NotAllowedError' || error?.name === 'SecurityError'; }
function isNotFound(error) { return error?.name === 'NotFoundError'; }
function isTypeMismatch(error) { return error?.name === 'TypeMismatchError'; }

function openDirectoryIterator(directory) {
  const iterable = directory.values();
  if (iterable && typeof iterable[Symbol.asyncIterator] === 'function') return iterable[Symbol.asyncIterator]();
  if (iterable && typeof iterable[Symbol.iterator] === 'function') return iterable[Symbol.iterator]();
  if (iterable && typeof iterable.next === 'function') return iterable;
  throw new TypeError('Directory values are not iterable.');
}

async function closeIterator(iterator) {
  if (!iterator || typeof iterator.return !== 'function') return;
  try { await iterator.return(); } catch {}
}

/**
 * Isolated File System Access directory adapter for Orbit Slice 1.
 * It does not install maps, decode documents, touch main.mjs, or own any UI state.
 *
 * Time checks are cooperative: they cannot cancel an already-pending native
 * iterator.next()/getFile() call. Early iteration does call iterator.return()
 * where the iterator supports it.
 */
export function createOrbitDirectoryAdapter({
  window = globalThis.window,
  now = () => Date.now(),
  maxEntries = DEFAULT_MAX_ORBIT_ENTRIES,
  maxDurationMs = DEFAULT_MAX_ENUMERATION_MS,
  maxLookaheadEntries = DEFAULT_LOOKAHEAD_ENTRIES,
  preflightMaxEntries = DEFAULT_PREFLIGHT_ENTRIES,
  preflightMaxDurationMs = DEFAULT_PREFLIGHT_MS
} = {}) {
  const supported = () => typeof window?.showDirectoryPicker === 'function';

  async function queryOnly(handle, mode = 'readwrite') {
    if (!handle || typeof handle.queryPermission !== 'function') {
      return { ok: true, permission: 'unknown', stage: 'permission-query' };
    }
    try {
      const permission = await handle.queryPermission({ mode });
      return { ok: true, permission, stage: 'permission-query' };
    } catch (error) {
      if (isDenied(error)) return failure('permission-denied', 'permission-query', error, 'Directory permission is denied.');
      return failure('permission-query-failed', 'permission-query', error, 'Could not query directory permission.');
    }
  }

  async function ensurePermission(handle, mode = 'readwrite') {
    const queried = await queryOnly(handle, mode);
    if (!queried.ok) return queried;
    if (queried.permission === 'granted' || queried.permission === 'unknown') return queried;
    if (queried.permission === 'denied') return failure('permission-denied', 'permission-query', null, 'Directory permission is denied.');
    if (typeof handle?.requestPermission !== 'function') {
      return failure('permission-denied', 'permission-request', null, 'Directory permission is required.');
    }
    try {
      const requested = await handle.requestPermission({ mode });
      if (requested !== 'granted') return failure('permission-denied', 'permission-request', null, 'Directory permission was denied.');
      return { ok: true, permission: 'granted', stage: 'permission-request' };
    } catch (error) {
      if (isDenied(error)) return failure('permission-denied', 'permission-request', error, 'Directory permission was denied.');
      return failure('permission-request-failed', 'permission-request', error, 'Could not request directory permission.');
    }
  }

  const ensureWritePermission = (handle) => ensurePermission(handle, 'readwrite');

  async function pickDirectory({ mode = 'readwrite' } = {}) {
    if (!supported()) return failure('unsupported', 'capability', null, 'Directory selection is not supported in this browser.');
    let stage = 'picker';
    try {
      const handle = await window.showDirectoryPicker({ mode });
      if (!handle) return failure('cancelled', 'picker', null, 'Directory selection was cancelled.');
      stage = 'permission-query';
      const permission = await ensurePermission(handle, mode);
      if (!permission.ok) return permission;
      return { ok: true, handle, name: String(handle.name || ''), permission: permission.permission, stage: 'ready' };
    } catch (error) {
      if (isAbort(error)) return failure('cancelled', stage, error, 'Directory selection was cancelled.');
      if (isDenied(error)) return failure('permission-denied', stage, error, 'Directory permission was denied.');
      return failure('picker-failed', stage, error, 'Directory selection failed.');
    }
  }

  async function caseInsensitivePreflight(directory, name, {
    isCurrent = () => true,
    scanLimit = preflightMaxEntries,
    durationMs = preflightMaxDurationMs,
    nowFn = now
  } = {}) {
    if (!directory || typeof directory.values !== 'function') {
      return { ok: false, reason: 'preflight-incomplete', incomplete: true, checked: false, scanned: 0, message: 'Case-insensitive directory preflight is unavailable.' };
    }
    const limit = Math.max(1, Number(scanLimit) || preflightMaxEntries);
    const timeLimit = Math.max(1, Number(durationMs) || preflightMaxDurationMs);
    const deadline = nowFn() + timeLimit;
    const current = () => {
      try { return Boolean(isCurrent?.()); } catch { return false; }
    };
    if (!current()) return { ok: false, reason: 'stale', stale: true, stage: 'preflight' };
    let iterator = null;
    let completed = false;
    let scanned = 0;
    try {
      iterator = openDirectoryIterator(directory);
      while (true) {
        if (!current()) return { ok: false, reason: 'stale', stale: true, stage: 'preflight', scanned };
        if (nowFn() >= deadline) {
          return { ok: false, reason: 'preflight-incomplete', incomplete: true, timedOut: true, checked: false, scanned };
        }
        const step = await iterator.next();
        if (step.done) { completed = true; return { ok: true, checked: true, scanned }; }
        if (!current()) return { ok: false, reason: 'stale', stale: true, stage: 'preflight', scanned };
        const value = step.value;
        const entry = Array.isArray(value) ? value[1] : value;
        const entryName = String((Array.isArray(value) ? value[0] : entry?.name) || '');
        scanned += 1;
        if (findOrbitNameCollision(name, [entryName])) {
          return { ok: false, reason: 'exists', collision: entryName, checked: true, scanned };
        }
        if (scanned >= limit) {
          // One bounded lookahead distinguishes an exactly-full directory from
          // an incomplete scan; an extra entry is never treated as "absent".
          const extra = await iterator.next();
          if (extra.done) { completed = true; return { ok: true, checked: true, scanned }; }
          return { ok: false, reason: 'preflight-incomplete', incomplete: true, limited: true, checked: false, scanned: scanned + 1 };
        }
      }
    } catch (error) {
      if (isDenied(error)) return { ok: false, reason: 'permission-denied', stage: 'preflight', error, checked: false, scanned };
      return { ok: false, reason: 'preflight-failed', stage: 'preflight', error, checked: false, scanned };
    } finally {
      if (!completed) await closeIterator(iterator);
    }
  }

  async function createChildDirectory(parent, rawName, options = {}) {
    const checked = validateOrbitDirectoryName(rawName);
    if (!checked.ok) return { ...checked, stage: 'validation' };
    if (!parent || typeof parent.getDirectoryHandle !== 'function') {
      return failure('operation-failed', 'create', null, 'A parent directory handle is required.');
    }
    const name = checked.name;
    const isCurrent = options.isCurrent || (() => true);
    const caseCheck = await caseInsensitivePreflight(parent, name, options);
    if (!caseCheck.ok) {
      if (caseCheck.reason === 'stale') return caseCheck;
      return failure(caseCheck.reason, 'preflight', caseCheck.error || null, caseCheck.reason === 'exists' ? 'A directory with that name already exists.' : caseCheck.reason === 'preflight-incomplete' ? 'The directory check was incomplete; no directory was created.' : 'Could not check the destination directory.');
    }
    if (!isCurrent()) return stale('preflight');
    try {
      await parent.getDirectoryHandle(name);
      return failure('exists', 'preflight', null, 'A directory with that name already exists.');
    } catch (error) {
      if (isTypeMismatch(error)) return failure('exists', 'preflight', error, 'A file with that name already exists.');
      if (!isNotFound(error)) {
        if (isDenied(error)) return failure('permission-denied', 'preflight', error, 'Directory permission was denied.');
        return failure('preflight-failed', 'preflight', error, 'Could not check the destination directory.');
      }
    }
    if (!isCurrent()) return stale('preflight');
    try {
      const handle = await parent.getDirectoryHandle(name, { create: true });
      if (!handle) return failure('create-failed', 'create', null, 'The destination directory was not returned.');
      return { ok: true, handle, name, created: 'preflight-absent', atomic: false, stage: 'created' };
    } catch (error) {
      if (isDenied(error)) return failure('permission-denied', 'create', error, 'Directory creation permission was denied.');
      return failure('create-failed', 'create', error, 'Could not create the Orbit directory.');
    }
  }

  async function enumerateTopLevelMaps(handle, {
    token = null,
    isCurrent = () => true,
    limit = maxEntries,
    durationMs = maxDurationMs,
    lookaheadLimit = maxLookaheadEntries,
    nowFn = now,
    includeFolders = false
  } = {}) {
    if (!handle || typeof handle.values !== 'function') {
      return failure('operation-failed', 'enumerate', null, 'A directory handle is required.');
    }
    const entryLimit = Math.max(1, Number(limit) || maxEntries);
    const timeLimit = Math.max(1, Number(durationMs) || maxDurationMs);
    const lookahead = Math.max(1, Number(lookaheadLimit) || maxLookaheadEntries);
    const deadline = nowFn() + timeLimit;
    const current = () => {
      try { return Boolean(isCurrent?.()); } catch { return false; }
    };
    if (!current()) return stale('enumerate');
    const entries = [];
    let scanned = 0;
    let skipped = 0;
    let truncated = false;
    let timedOut = false;
    let lookaheadLimited = false;
    let lookaheadMatched = false;
    let lookaheadCount = 0;
    let iterator = null;
    let completed = false;
    try {
      iterator = openDirectoryIterator(handle);
      while (true) {
        if (!current()) return stale('enumerate');
        if (nowFn() >= deadline) { timedOut = true; truncated = true; break; }
        const step = await iterator.next();
        if (step.done) { completed = true; break; }
        const value = step.value;
        scanned += 1;
        const fileHandle = Array.isArray(value) ? value[1] : value;
        const name = String((Array.isArray(value) ? value[0] : fileHandle?.name) || '');
        const kind = String(fileHandle?.kind || 'file');
        const isMap = kind === 'file' && /\.orbit$/i.test(name);
        const isFolder = kind === 'directory';
        const wanted = isFolder ? includeFolders : isMap;
        if (entries.length >= entryLimit) {
          lookaheadCount += 1;
          if (wanted) {
            truncated = true;
            lookaheadMatched = true;
            break;
          }
          if (lookaheadCount >= lookahead) {
            truncated = true;
            lookaheadLimited = true;
            break;
          }
          continue;
        }
        if (!wanted) continue;
        if (isFolder) {
          entries.push({ handle: fileHandle, name, kind: 'folder', size: 0, lastModified: 0, type: '' });
          continue;
        }
        let file;
        try { file = await fileHandle.getFile(); }
        catch (error) {
          if (isNotFound(error)) { skipped += 1; continue; }
          if (isDenied(error)) return failure('permission-denied', 'enumerate', error, 'Directory permission was denied while reading metadata.');
          return failure('enumerate-failed', 'enumerate', error, 'Could not read map metadata.');
        }
        if (!current()) return stale('enumerate');
        if (nowFn() >= deadline) { timedOut = true; truncated = true; break; }
        entries.push({
          handle: fileHandle,
          name,
          kind: 'file',
          size: Number(file.size) || 0,
          lastModified: Number(file.lastModified) || 0,
          type: String(file.type || '')
        });
      }
    } catch (error) {
      if (isDenied(error)) return failure('permission-denied', 'enumerate', error, 'Directory permission was denied.');
      return failure('enumerate-failed', 'enumerate', error, 'Could not enumerate the Orbit directory.');
    } finally {
      if (!completed) await closeIterator(iterator);
    }
    if (!current()) return stale('enumerate');
    return { ok: true, token, entries, truncated, timedOut, lookaheadLimited, lookaheadMatched, scanned, skipped, stage: 'ready' };
  }

  async function getFileMetadata(handle) {
    if (!handle || typeof handle.getFile !== 'function') {
      return failure('operation-failed', 'metadata', null, 'A file handle is required.');
    }
    try {
      const file = await handle.getFile();
      return { ok: true, name: String(file.name || handle.name || ''), size: Number(file.size) || 0, lastModified: Number(file.lastModified) || 0, type: String(file.type || ''), stage: 'metadata' };
    } catch (error) {
      if (isNotFound(error)) return failure('not-found', 'metadata', error, 'That file no longer exists.');
      if (isDenied(error)) return failure('permission-denied', 'metadata', error, 'File permission was denied.');
      return failure('metadata-failed', 'metadata', error, 'Could not read file metadata.');
    }
  }

  async function createMapFile(directory, rawFilename, options = {}) {
    const checked = normalizeOrbitMapFilename(rawFilename);
    if (!checked.ok) return { ...checked, stage: 'validation' };
    if (!directory || typeof directory.getFileHandle !== 'function') {
      return failure('operation-failed', 'create', null, 'An Orbit directory handle is required.');
    }
    const filename = checked.filename;
    const isCurrent = options.isCurrent || (() => true);
    const caseCheck = await caseInsensitivePreflight(directory, filename, options);
    if (!caseCheck.ok) {
      if (caseCheck.reason === 'stale') return caseCheck;
      return failure(caseCheck.reason, 'preflight', caseCheck.error || null, caseCheck.reason === 'exists' ? 'A file with that name already exists.' : caseCheck.reason === 'preflight-incomplete' ? 'The filename check was incomplete; no file was created.' : 'Could not check the destination filename.');
    }
    if (!isCurrent()) return stale('preflight');
    try {
      await directory.getFileHandle(filename);
      return failure('exists', 'preflight', null, 'A file with that name already exists.');
    } catch (error) {
      if (isTypeMismatch(error)) return failure('exists', 'preflight', error, 'A directory with that name already exists.');
      if (!isNotFound(error)) {
        if (isDenied(error)) return failure('permission-denied', 'preflight', error, 'File permission was denied.');
        return failure('preflight-failed', 'preflight', error, 'Could not check the destination filename.');
      }
    }
    if (!isCurrent()) return stale('preflight');
    try {
      const handle = await directory.getFileHandle(filename, { create: true });
      if (!handle) return failure('create-failed', 'create', null, 'The map file handle was not returned.');
      return { ok: true, handle, name: filename, created: 'preflight-absent', atomic: false, stage: 'created' };
    } catch (error) {
      if (isDenied(error)) return failure('permission-denied', 'create', error, 'File creation permission was denied.');
      return failure('create-failed', 'create', error, 'Could not create the map file.');
    }
  }

  async function writeFile(handle, blob) {
    if (!handle || typeof handle.createWritable !== 'function') {
      return failure('operation-failed', 'createWritable', null, 'A writable file handle is required.');
    }
    let writable = null;
    let stage = 'createWritable';
    try {
      writable = await handle.createWritable();
      stage = 'write';
      await writable.write(blob);
      stage = 'close';
      await writable.close();
      return { ok: true, stage: 'closed' };
    } catch (error) {
      try { await writable?.abort?.(); } catch {}
      if (isDenied(error)) return failure('permission-denied', stage, error, 'Write permission was denied.');
      return failure('write-failed', stage, error, 'Could not write the map file.');
    }
  }

  return {
    get supported() { return supported(); },
    pickDirectory,
    createChildDirectory,
    enumerateTopLevelMaps,
    enumerateBrowserEntries(handle, options = {}) { return enumerateTopLevelMaps(handle, { ...options, includeFolders: true }); },
    getFileMetadata,
    createMapFile,
    writeFile,
    queryWritePermission(handle) { return queryOnly(handle, 'readwrite'); },
    requestWritePermission(handle) { return ensurePermission(handle, 'readwrite'); },
    queryReadPermission(handle) { return queryOnly(handle, 'read'); },
    requestReadPermission(handle) { return ensurePermission(handle, 'read'); }
  };
}

