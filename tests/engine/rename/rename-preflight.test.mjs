import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRenameParent, buildRenamePreflight, describeRenameCapability } from '../../../src/engine/hypertree/rename/index.js';

let nextIdentity = 1;
function handle(name, { kind = 'file', identity = null, accept = null, throwIdentity = false } = {}) {
  const id = identity ?? 'h' + (++nextIdentity);
  const value = {
    kind,
    name,
    id,
    async isSameEntry(other) {
      if (throwIdentity) throw new Error('identity unavailable');
      if (!other) return false;
      if (other === value) return true;
      if (accept) return Boolean(await accept(other));
      return other.id === id;
    }
  };
  return value;
}
function entry(name, fileHandle, kind = 'file') { return { name, handle: fileHandle, type: kind, kind }; }
function candidate(handleValue, { source = 'library', libraryId = null, name = handleValue.name } = {}) { return { handle: handleValue, source, libraryId, name }; }
function activeState(overrides = {}) {
  return {
    datasetToken: 'dataset-1',
    session: 4,
    ownership: 7,
    revision: 9,
    handle: overrides.handle,
    documentIdentity: 'orbit:3',
    savedRevision: 9,
    ...overrides
  };
}
function parentResult(activeHandle, entries, { libraryId = 'lib-1', parentName = 'Library' } = {}) {
  const source = entries.find((value) => value.handle === activeHandle || value.active);
  return {
    ok: true,
    parent: { handle: handle('Library', { kind: 'directory', identity: 'dir-1' }), name: parentName, libraryId, libraryIds: libraryId ? [libraryId] : [], sources: ['library'] },
    entry: { ...source, active: true },
    entries: entries.map((value) => value.handle === source.handle ? { ...value, active: true } : value),
    candidates: [], scanned: entries.length
  };
}
function preflight(activeHandle, entries, proposedName, overrides = {}) {
  const parent = overrides.parent || parentResult(activeHandle, entries);
  const current = overrides.current || activeState({ handle: activeHandle });
  const captured = overrides.captured || { ...current };
  return buildRenamePreflight({
    tree: overrides.tree || { id: 'root', name: 'Old Map', children: [] },
    activeHandle,
    activeDocumentName: overrides.activeDocumentName ?? entries.find((value) => value.handle === activeHandle)?.name ?? null,
    documentIdentity: overrides.documentIdentity ?? 'orbit:3',
    baseline: overrides.baseline ?? { handle: activeHandle, documentIdentity: 'orbit:3', digest: 'abc', size: 3 },
    current,
    captured,
    parent,
    proposedName,
    backend: overrides.backend || 'opfs'
  });
}
function adapterFor({ permissions = {}, listings = {}, calls = null } = {}) {
  return {
    async queryReadPermission(directory) {
      if (calls) calls.queries.push(directory);
      return permissions[directory.name] || { ok: true, permission: 'granted' };
    },
    async enumerateTopLevelMaps(directory) {
      if (calls) calls.lists.push(directory);
      const value = listings[directory.name];
      if (typeof value === 'function') return value(directory);
      return value || { ok: true, entries: [], truncated: false };
    }
  };
}

test('resolves a selected directory by file identity and deduplicates an equivalent Library handle', async () => {
  const active = handle('Map.orbit');
  const directory = handle('Library', { kind: 'directory', identity: 'dir-1' });
  const clone = handle('Library', { kind: 'directory', identity: 'dir-1' });
  const other = handle('Other.orbit');
  const calls = { queries: [], lists: [] };
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    libraries: [{ id: 'lib-1', name: 'Library', handle: clone }],
    adapter: adapterFor({ listings: { Library: { ok: true, entries: [entry('Other.orbit', other), entry('Map.orbit', active)], truncated: false } }, calls })
  });
  assert.equal(result.ok, true);
  assert.equal(result.entry.handle, active);
  assert.equal(result.entry.name, 'Map.orbit');
  assert.equal(result.parent.libraryIds.includes('lib-1'), true);
  assert.equal(result.parent.sources.includes('selected'), true);
  assert.equal(result.parent.sources.includes('library'), true);
  assert.equal(result.candidates.length, 1);
  assert.equal(calls.lists.length, 1, 'equivalent directories must be enumerated once');
});

test('resolves an active file only in an unselected linked Library', async () => {
  const active = handle('Map.orbit');
  const selected = handle('Selected', { kind: 'directory', identity: 'dir-1' });
  const linked = handle('Linked', { kind: 'directory', identity: 'dir-2' });
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: selected, name: 'Selected' },
    libraries: [{ id: 'lib-2', name: 'Linked', handle: linked }],
    adapter: adapterFor({
      listings: {
        Selected: { ok: true, entries: [entry('Map.orbit', handle('Map.orbit'))], truncated: false },
        Linked: { ok: true, entries: [entry('Map.orbit', active)], truncated: false }
      }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.parent.libraryId, 'lib-2');
});

test('does not match a same-name distinct file in another directory', async () => {
  const active = handle('Map.orbit');
  const wrong = handle('Map.orbit');
  const selected = handle('Selected', { kind: 'directory', identity: 'dir-1' });
  const linked = handle('Linked', { kind: 'directory', identity: 'dir-2' });
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: selected, name: 'Selected' },
    libraries: [{ id: 'lib-2', name: 'Linked', handle: linked }],
    adapter: adapterFor({
      listings: {
        Selected: { ok: true, entries: [entry('Map.orbit', wrong)], truncated: false },
        Linked: { ok: true, entries: [entry('Map.orbit', active)], truncated: false }
      }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.parent.libraryId, 'lib-2');
  assert.equal(result.entry.handle, active);
});

test('accepts an equivalent cloned active file handle', async () => {
  const active = handle('Map.orbit', { identity: 'file-1' });
  const clone = handle('Map.orbit', { identity: 'file-1' });
  const directory = handle('Library', { kind: 'directory' });
  const result = await resolveRenameParent({
    activeHandle: clone,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ listings: { Library: { ok: true, entries: [entry('Map.orbit', active)], truncated: false } } })
  });
  assert.equal(result.ok, true);
  assert.equal(result.entry.handle, active);
});

test('permission-required and denied candidates are not scanned or requested', async () => {
  const active = handle('Map.orbit');
  const directory = handle('Library', { kind: 'directory' });
  const calls = { queries: [], lists: [] };
  const required = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ permissions: { Library: { ok: true, permission: 'prompt' } }, calls })
  });
  assert.equal(required.ok, false);
  assert.equal(required.reason, 'permission-required');
  assert.equal(calls.lists.length, 0);
  const denied = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ permissions: { Library: { ok: false, reason: 'permission-denied' } }, calls })
  });
  assert.equal(denied.reason, 'permission-denied');
  assert.equal(calls.lists.length, 0);
});

test('incomplete listings are not treated as absence', async () => {
  const active = handle('Map.orbit');
  const directory = handle('Library', { kind: 'directory' });
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ listings: { Library: { ok: true, entries: [], truncated: true } } })
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'incomplete-enumeration');
});

test('identity errors and stale callbacks are reported without falling back to names', async () => {
  const active = handle('Map.orbit');
  const wrong = handle('Map.orbit', { throwIdentity: true });
  const directory = handle('Library', { kind: 'directory' });
  const identityError = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ listings: { Library: { ok: true, entries: [entry('Map.orbit', wrong)] } } })
  });
  assert.equal(identityError.ok, false);
  assert.equal(identityError.reason, 'identity-failure');

  let current = true;
  const stale = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    isCurrent: () => current,
    adapter: {
      async queryReadPermission() { current = false; return { ok: true, permission: 'granted' }; },
      async enumerateTopLevelMaps() { return { ok: true, entries: [entry('Map.orbit', active)] }; }
    }
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale');
});

test('a verified match cannot hide an unreadable candidate', async () => {
  const active = handle('Map.orbit');
  const selected = handle('Selected', { kind: 'directory' });
  const linked = handle('Linked', { kind: 'directory' });
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: selected, name: 'Selected' },
    libraries: [{ id: 'lib-2', name: 'Linked', handle: linked }],
    adapter: adapterFor({
      permissions: { Linked: { ok: true, permission: 'prompt' } },
      listings: { Selected: { ok: true, entries: [entry('Map.orbit', active)] } }
    })
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unverified-uniqueness');
});

test('multiple verified parents are ambiguous', async () => {
  const active = handle('Map.orbit');
  const first = handle('First', { kind: 'directory' });
  const second = handle('Second', { kind: 'directory' });
  const result = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: first, name: 'First' },
    libraries: [{ id: 'lib-2', name: 'Second', handle: second }],
    adapter: adapterFor({
      listings: {
        First: { ok: true, entries: [entry('Map.orbit', active)] },
        Second: { ok: true, entries: [entry('Map.orbit', active)] }
      }
    })
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ambiguous-parent');
});

test('resolver distinguishes a complete no-match from inconclusive candidates', async () => {
  const active = handle('Map.orbit');
  const directory = handle('Library', { kind: 'directory' });
  const noMatch = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ listings: { Library: { ok: true, entries: [entry('Other.orbit', handle('Other.orbit'))] } } })
  });
  assert.equal(noMatch.ok, false);
  assert.equal(noMatch.reason, 'no-verified-parent');
  const unavailable = await resolveRenameParent({
    activeHandle: active,
    selectedDirectory: { handle: directory, name: 'Library' },
    adapter: adapterFor({ listings: { Library: { ok: false, reason: 'enumerate-failed' } } })
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, 'incomplete-enumeration');
});

test('preflight rejects an unverified parent result', () => {
  const active = handle('Map.orbit');
  const plan = preflight(active, [entry('Map.orbit', active)], 'New Map', { parent: { ok: false, reason: 'permission-required', message: 'Read permission is required.' } });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'permission-required');
});

test('preflight full no-op and title-only/filename-only classifications', () => {
  const active = handle('Old Map.orbit');
  const entries = [entry('Old Map.orbit', active)];
  let plan = preflight(active, entries, 'Old Map');
  assert.equal(plan.ok, true);
  assert.equal(plan.noop, true);
  assert.equal(plan.kind, 'noop');

  plan = preflight(active, entries, 'New Map');
  assert.equal(plan.kind, 'both');

  plan = preflight(active, [{ ...entry('Old Name.orbit', active) }], 'Old Map');
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'filename-only');
  assert.equal(plan.noop, false);
  assert.equal(plan.current.title, 'Old Map');
  assert.equal(plan.filename, 'Old Map.orbit');

  plan = preflight(active, entries, 'New Map', { tree: { id: 'root', name: 'Old Name', children: [] } });
  assert.equal(plan.kind, 'both');

  const titleOnly = preflight(active, entries, 'Old Map', { tree: { id: 'root', name: 'Old Name', children: [] } });
  assert.equal(titleOnly.ok, true);
  assert.equal(titleOnly.kind, 'title-only');
  assert.equal(titleOnly.change.needsFilesystemRename, false);
});

test('preflight derives one .orbit filename and reports normalization review', () => {
  const active = handle('Old Map.orbit');
  const entries = [entry('Old Map.orbit', active)];
  const edge = preflight(active, entries, 'New:Map.orbit');
  assert.equal(edge.ok, true);
  assert.equal(edge.title, 'New Map');
  assert.equal(edge.filename, 'New Map.orbit');
  assert.equal(edge.requiresConfirmation, true);
  assert.equal(edge.filename.endsWith('.orbit'), true);
  assert.equal(edge.filename.slice(0, -6).toLowerCase().endsWith('.orbit'), false);
});

test('preflight rejects invalid, reserved, long and traversal names', () => {
  const active = handle('Old Map.orbit');
  const entries = [entry('Old Map.orbit', active)];
  for (const name of ['', 'A/B', 'A\\B', 'CON', 'NUL.orbit', 'A.', 'A\u0000B']) {
    const plan = preflight(active, entries, name);
    assert.equal(plan.ok, false, name);
    assert.equal(plan.reason.startsWith('name-') || plan.reason === 'invalid-name', true, plan.reason);
  }
  const trimmed = preflight(active, entries, 'A ');
  assert.equal(trimmed.ok, true);
  assert.equal(trimmed.title, 'A');
  assert.equal(trimmed.requiresConfirmation, true);
  const long = preflight(active, entries, 'x'.repeat(81));
  assert.equal(long.ok, false);
  assert.equal(long.reason, 'name-too-long');
  const boundary = preflight(active, entries, 'x'.repeat(80));
  assert.equal(boundary.ok, true);
});

test('preflight classifies case-only and Unicode-equivalent changes', () => {
  const active = handle('Old Map.orbit');
  const entries = [entry('Old Map.orbit', active)];
  const caseOnly = preflight(active, entries, 'old map');
  assert.equal(caseOnly.ok, true);
  assert.equal(caseOnly.change.caseOnlyFilenameChange, true);
  assert.equal(caseOnly.noop, false);
  const composed = preflight(active, [entry('Cafe\u0301.orbit', active)], 'Caf\u00e9');
  assert.equal(composed.ok, true);
  assert.equal(composed.change.normalizationEquivalentFilenameChange, true);
});

test('preflight excludes source by identity and rejects destination collisions', () => {
  const active = handle('Old Map.orbit');
  const other = handle('New Map.orbit');
  const entries = [entry('Old Map.orbit', active), entry('New Map.orbit', other)];
  const collision = preflight(active, entries, 'New Map');
  assert.equal(collision.ok, false);
  assert.equal(collision.reason, 'destination-collision');
  const directory = preflight(active, [entry('Old Map.orbit', active), entry('New Map.orbit', other, 'directory')], 'New Map');
  assert.equal(directory.ok, false);
  assert.equal(directory.reason, 'destination-collision');
  assert.equal(directory.collisions[0].kind, 'directory');
  const noOp = preflight(active, [entry('Old Map.orbit', active), entry('New Map.orbit', other)], 'Old Map');
  assert.equal(noOp.ok, true);
  assert.equal(noOp.noop, true);
});

test('preflight rejects stale ownership and source mutation', () => {
  const active = handle('Old Map.orbit');
  const entries = [entry('Old Map.orbit', active)];
  const current = activeState({ handle: active });
  const stale = preflight(active, entries, 'New Map', { captured: { ...current, revision: 8 } });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale-ownership');
  const wrongHandle = handle('Old Map.orbit');
  const handleMismatch = preflight(active, entries, 'New Map', { current: activeState({ handle: wrongHandle }), captured: activeState({ handle: wrongHandle }) });
  assert.equal(handleMismatch.ok, false);
  assert.equal(handleMismatch.reason, 'stale-ownership');
});

test('preflight does not mutate the tree or parent entries', () => {
  const active = handle('Old Map.orbit');
  const other = handle('Other.orbit');
  const entries = [entry('Old Map.orbit', active), entry('Other.orbit', other)];
  const tree = { id: 'root', name: 'Old Map', children: [{ id: 'child', name: 'Child', kind: 'folder', children: [] }] };
  const beforeTree = JSON.stringify(tree);
  const beforeEntries = JSON.stringify(entries.map((value) => ({ name: value.name, type: value.type })));
  const plan = preflight(active, entries, 'New Map', { tree });
  assert.equal(plan.ok, true);
  assert.equal(JSON.stringify(tree), beforeTree);
  assert.equal(JSON.stringify(entries.map((value) => ({ name: value.name, type: value.type }))), beforeEntries);
});

test('capability description never calls methods and does not equate presence with verification', () => {
  let calls = 0;
  const fileHandle = {
    kind: 'file', name: 'Old.orbit',
    move() { calls += 1; },
    createWritable() { calls += 1; }
  };
  const parentHandle = {
    getFileHandle() { calls += 1; },
    removeEntry() { calls += 1; }
  };
  const present = describeRenameCapability({ fileHandle, parentHandle, backend: 'native-windows' });
  assert.equal(present.directMovePresent, true);
  assert.equal(present.directMoveVerified, false);
  assert.equal(present.directMoveEligible, false);
  assert.equal(present.directMoveAuthorized, false);
  assert.equal(present.directMoveBlockedReason, 'backend-unverified');
  assert.equal(present.strategy, 'copy-verify-remove');
  assert.equal(present.overwriteSemantics, 'unverified');
  assert.equal(present.requiresFurtherCapabilityVerification, true);
  assert.equal(calls, 0);

  const presenceWithoutCopy = describeRenameCapability({ fileHandle, parentHandle: { kind: 'directory' }, backend: 'native-windows' });
  assert.equal(presenceWithoutCopy.directMoveEligible, false);
  assert.equal(presenceWithoutCopy.directMoveAuthorized, false);
  assert.equal(presenceWithoutCopy.strategy, 'unavailable');
  assert.equal(presenceWithoutCopy.requiresFurtherCapabilityVerification, true);
  assert.equal(calls, 0);

  const verifiedMoveOnly = describeRenameCapability({ fileHandle, parentHandle, backend: 'native-windows', directMoveVerification: 'verified-backend' });
  assert.equal(verifiedMoveOnly.directMoveEligible, false);
  assert.equal(verifiedMoveOnly.directMoveAuthorized, false);
  assert.equal(verifiedMoveOnly.directMoveBlockedReason, 'overwrite-unverified');
  assert.equal(verifiedMoveOnly.overwriteSemantics, 'unverified');
  assert.equal(verifiedMoveOnly.strategy, 'copy-verify-remove');
  assert.equal(verifiedMoveOnly.requiresFurtherCapabilityVerification, true);
  assert.equal(calls, 0);

  const verified = describeRenameCapability({ fileHandle, parentHandle, backend: 'native-windows', directMoveVerification: 'verified-backend', overwriteSemanticsVerification: 'no-overwrite' });
  assert.equal(verified.strategy, 'direct-move');
  assert.equal(verified.overwriteSemantics, 'verified-no-overwrite');

  const overwriteOnly = describeRenameCapability({ fileHandle: { kind: 'file', createWritable() {} }, parentHandle: { getFileHandle() {}, removeEntry() {} }, backend: 'opfs', overwriteSemanticsVerification: 'no-overwrite' });
  assert.equal(overwriteOnly.directMovePresent, false);
  assert.equal(overwriteOnly.directMoveEligible, false);
  assert.equal(overwriteOnly.overwriteSemantics, 'verified-no-overwrite');
  assert.equal(overwriteOnly.strategy, 'copy-verify-remove');
  assert.equal(calls, 0);

  const fallback = describeRenameCapability({ fileHandle: { kind: 'file', createWritable() {} }, parentHandle: { getFileHandle() {}, removeEntry() {} }, backend: 'opfs' });
  assert.equal(fallback.directMovePresent, false);
  assert.equal(fallback.directMoveEligible, false);
  assert.equal(fallback.copyPathAvailable, true);
  assert.equal(fallback.copyPathAuthorized, false);
  assert.equal(fallback.strategy, 'copy-verify-remove');
  assert.equal(calls, 0);

  const unavailable = describeRenameCapability({ fileHandle: { kind: 'file' }, parentHandle: { kind: 'directory' }, backend: 'unknown' });
  assert.equal(unavailable.directMovePresent, false);
  assert.equal(unavailable.copyPathAvailable, false);
  assert.equal(unavailable.strategy, 'unavailable');
  assert.equal(unavailable.directMoveEligible, false);
  assert.equal(calls, 0);
});
