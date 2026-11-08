/**
 * Read-only Rename Map parent resolution.
 *
 * Candidates are the currently selected Orbit directory and linked Library
 * directory records. Membership is established only through FileSystemHandle
 * identity; names and the selected Library are never treated as proof.
 *
 * This module never requests permission, writes, moves, removes or changes
 * application/Library state.
 */
function failure(reason, stage, message, extra = {}) {
  return { ok: false, reason, stage, message, ...extra };
}

function staleFailure(stage) {
  return failure('stale', stage, 'The active document or resolution operation changed.');
}

function permissionState(result) {
  if (!result || result.ok === false) {
    if (result?.reason === 'permission-denied') return 'denied';
    if (result?.reason === 'permission-required') return 'prompt';
    return 'unavailable';
  }
  const permission = String(result.permission || 'unknown');
  if (permission === 'granted') return 'granted';
  if (permission === 'denied') return 'denied';
  if (permission === 'prompt') return 'prompt';
  return 'unavailable';
}

async function sameHandle(left, right) {
  if (!left || !right) return { ok: false, same: false };
  if (left === right) return { ok: true, same: true };
  if (typeof left.isSameEntry !== 'function') return { ok: false, same: false };
  try {
    return { ok: true, same: Boolean(await left.isSameEntry(right)) };
  } catch (error) {
    return { ok: false, same: false, error };
  }
}

function candidateStatus(candidate, status, extra = {}) {
  return Object.freeze({
    source: candidate.source,
    libraryId: candidate.libraryId ?? null,
    libraryIds: Object.freeze([...(candidate.libraryIds || [])]),
    sources: Object.freeze([...(candidate.sources || [candidate.source])]),
    name: String(candidate.name || ''),
    handle: candidate.handle,
    status,
    ...extra
  });
}

function unavailableReason(candidates) {
  if (candidates.some((candidate) => candidate.status === 'identity-failure')) return 'identity-failure';
  if (candidates.some((candidate) => candidate.status === 'permission-required')) return 'permission-required';
  if (candidates.some((candidate) => candidate.status === 'permission-denied')) return 'permission-denied';
  if (candidates.some((candidate) => candidate.status === 'permission-unavailable')) return 'permission-unavailable';
  if (candidates.some((candidate) => candidate.status === 'ambiguous-entry')) return 'ambiguous-parent';
  if (candidates.some((candidate) => candidate.status === 'incomplete')) return 'incomplete-enumeration';
  return 'no-verified-parent';
}

/**
 * Resolve the immediate parent of an active file handle.
 *
 * @param {object} options
 * @param {FileSystemFileHandle} options.activeHandle
 * @param {{handle: FileSystemDirectoryHandle, name?: string, libraryId?: string|null}|null} options.selectedDirectory
 * @param {Array<{handle: FileSystemDirectoryHandle, id?: string, libraryId?: string, name?: string}>} options.libraries
 * @param {object} options.adapter Query/enumeration adapter. Only queryReadPermission
 *   and enumerateTopLevelMaps (or listImmediateEntries) are used.
 * @param {() => boolean} [options.isCurrent]
 * @param {() => number} [options.now]
 */
export async function resolveRenameParent({
  activeHandle = null,
  selectedDirectory = null,
  libraries = [],
  adapter = null,
  isCurrent = () => true,
  now = () => Date.now()
} = {}) {
  const current = () => {
    try { return Boolean(isCurrent()); } catch { return false; }
  };
  if (!current()) return staleFailure('start');
  if (!activeHandle || activeHandle.kind !== 'file') {
    return failure('invalid-active-handle', 'start', 'A writable file handle is required.');
  }
  if (!adapter || typeof adapter.queryReadPermission !== 'function' || (typeof adapter.enumerateTopLevelMaps !== 'function' && typeof adapter.listImmediateEntries !== 'function')) {
    return failure('adapter-unavailable', 'start', 'Read-only directory inspection is unavailable.');
  }

  const rawCandidates = [];
  if (selectedDirectory?.handle) {
    rawCandidates.push({
      source: 'selected',
      sources: ['selected'],
      selected: true,
      handle: selectedDirectory.handle,
      name: selectedDirectory.name || selectedDirectory.handle.name || '',
      libraryId: selectedDirectory.libraryId ?? null,
      libraryIds: selectedDirectory.libraryId ? [selectedDirectory.libraryId] : []
    });
  }
  for (const record of Array.isArray(libraries) ? libraries : []) {
    if (!record?.handle) continue;
    rawCandidates.push({
      source: 'library',
      sources: ['library'],
      selected: false,
      handle: record.handle,
      name: record.name || record.handle.name || '',
      libraryId: record.id ?? record.libraryId ?? null,
      libraryIds: record.id ?? record.libraryId ? [record.id ?? record.libraryId] : []
    });
  }
  if (rawCandidates.length === 0) {
    return failure('no-candidates', 'deduplicate', 'No selected or linked directory is available to verify the parent.');
  }

  const candidates = [];
  for (const candidate of rawCandidates) {
    if (!candidate.handle || candidate.handle.kind !== 'directory') {
      return failure('invalid-candidate', 'deduplicate', 'A candidate directory handle is invalid.', { candidate: { source: candidate.source, libraryId: candidate.libraryId ?? null, name: candidate.name } });
    }
    let duplicate = null;
    for (const existing of candidates) {
      const compared = await sameHandle(existing.handle, candidate.handle);
      if (!current()) return staleFailure('deduplicate');
      if (!compared.ok) {
        return failure('identity-failure', 'deduplicate', 'Candidate directory identity could not be verified.', { candidate: { source: candidate.source, libraryId: candidate.libraryId ?? null, name: candidate.name } });
      }
      if (compared.same) { duplicate = existing; break; }
    }
    if (duplicate) {
      duplicate.selected = duplicate.selected || candidate.selected;
      duplicate.sources = [...new Set([...(duplicate.sources || []), ...(candidate.sources || [])])];
      duplicate.libraryIds = [...new Set([...duplicate.libraryIds, ...candidate.libraryIds])];
      duplicate.libraryId = duplicate.libraryId ?? candidate.libraryId ?? duplicate.libraryIds[0] ?? null;
      duplicate.libraryNames = [...new Set([...duplicate.libraryNames, candidate.name].filter(Boolean))];
    } else {
      candidates.push({
        ...candidate,
        libraryIds: [...new Set(candidate.libraryIds)],
        libraryNames: candidate.name ? [candidate.name] : []
      });
    }
  }

  const results = [];
  const matches = [];
  for (const candidate of candidates) {
    if (!current()) return staleFailure('permission');
    let permissionResult;
    try { permissionResult = await adapter.queryReadPermission(candidate.handle); }
    catch (error) {
      if (!current()) return staleFailure('permission');
      results.push(candidateStatus(candidate, 'permission-unavailable', { errorName: String(error?.name || ''), errorMessage: String(error?.message || error) }));
      continue;
    }
    if (!current()) return staleFailure('permission');
    const permission = permissionState(permissionResult);
    if (permission === 'prompt') { results.push(candidateStatus(candidate, 'permission-required')); continue; }
    if (permission === 'denied') { results.push(candidateStatus(candidate, 'permission-denied')); continue; }
    if (permission !== 'granted') { results.push(candidateStatus(candidate, 'permission-unavailable')); continue; }

    let listed;
    const list = typeof adapter.listImmediateEntries === 'function' ? adapter.listImmediateEntries : adapter.enumerateTopLevelMaps;
    try { listed = await list.call(adapter, candidate.handle, { isCurrent: current, includeFolders: true }); }
    catch (error) {
      if (!current()) return staleFailure('enumerate');
      results.push(candidateStatus(candidate, 'incomplete', { errorName: String(error?.name || ''), errorMessage: String(error?.message || error) }));
      continue;
    }
    if (!current()) return staleFailure('enumerate');
    if (!listed || listed.ok !== true || !Array.isArray(listed.entries) || listed.truncated === true || listed.truncation || Number(listed.skipped) > 0) {
      results.push(candidateStatus(candidate, 'incomplete', {
        reason: listed?.reason || (listed?.truncated ? 'truncated' : 'incomplete'),
        scanned: Number(listed?.scanned) || 0
      }));
      continue;
    }

    const candidateMatches = [];
    let identityFailure = null;
    for (let index = 0; index < listed.entries.length; index += 1) {
      if (!current()) return staleFailure('identity');
      const entry = listed.entries[index];
      if (!entry || !entry.handle || !entry.name) continue;
      const compared = await sameHandle(entry.handle, activeHandle);
      if (!current()) return staleFailure('identity');
      if (!compared.ok) {
        identityFailure = { index, name: String(entry.name || ''), errorName: String(compared.error?.name || ''), errorMessage: String(compared.error?.message || compared.error || '') };
        break;
      }
      if (compared.same) candidateMatches.push({ index, entry });
    }
    if (identityFailure) {
      results.push(candidateStatus(candidate, 'identity-failure', identityFailure));
      continue;
    }
    if (candidateMatches.length > 1) {
      results.push(candidateStatus(candidate, 'ambiguous-entry', { matchCount: candidateMatches.length }));
      continue;
    }
    if (candidateMatches.length === 1) {
      const matched = candidateMatches[0];
      const entry = Object.freeze({ ...matched.entry, active: true });
      const entries = listed.entries.map((value, index) => index === matched.index ? { ...value, active: true } : value);
      const result = candidateStatus(candidate, 'match', { entry, entries, scanned: listed.entries.length });
      results.push(result);
      matches.push(result);
    } else {
      results.push(candidateStatus(candidate, 'no-match', { scanned: listed.entries.length }));
    }
  }

  if (!current()) return staleFailure('finish');
  const blocked = results.filter((result) => !['match', 'no-match'].includes(result.status));
  if (matches.length > 1) {
    return failure('ambiguous-parent', 'resolve', 'The active file was matched in more than one candidate directory.', { candidates: results });
  }
  if (matches.length === 1) {
    if (blocked.length > 0) {
      return failure('unverified-uniqueness', 'resolve', 'The file matched one directory, but another candidate could not be conclusively inspected.', { candidates: results, match: matches[0] });
    }
    const match = matches[0];
    return Object.freeze({
      ok: true,
      schema: 'fileorbit-rename-parent-v1',
      parent: Object.freeze({
        handle: match.handle,
        name: match.name,
        libraryId: match.libraryId,
        libraryIds: Object.freeze([...match.libraryIds]),
        sources: Object.freeze([...new Set(match.sources || [match.source])])
      }),
      entry: match.entry,
      entries: Object.freeze([...match.entries]),
      candidates: Object.freeze(results),
      scanned: match.scanned,
      checkedAt: now()
    });
  }
  return failure(unavailableReason(results), 'resolve', 'The active file parent could not be verified by identity.', { candidates: results });
}
