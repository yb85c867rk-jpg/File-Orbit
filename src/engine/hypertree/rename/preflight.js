/**
 * Pure Rename Map preflight.
 *
 * This module does not apply the proposed title, save, request permission,
 * mutate history/settings, or call any filesystem write/move/remove method.
 */
import { normalizeOrbitMapFilename, orbitNameKey, isOrbitMapFilename, MAX_ORBIT_NAME_CODE_POINTS } from '../orbit/names.js';
import { validateName } from '../editor/validation.js';
import { describeRenameCapability } from './capability.js';

const IDENTITY_FIELDS = ['datasetToken', 'session', 'ownership', 'revision'];

function fail(reason, stage, message, extra = {}) {
  return Object.freeze({ ok: false, schema: 'fileorbit-rename-preflight-v1', reason, stage, message, ...extra });
}

function identityFailure(message, extra = {}) {
  return fail('stale-ownership', 'identity', message, extra);
}

function entryKind(entry) {
  const value = String(entry?.kind || entry?.type || '');
  return value === 'directory' ? 'directory' : 'file';
}

function entryIsSource(entry, parent, activeHandle) {
  return Boolean(entry?.active === true || entry === parent?.entry || entry?.handle === activeHandle);
}

/**
 * Build a read-only rename plan from an already verified parent result.
 *
 * @param {object} options
 * @param {{id?: string, name: string, children?: object[]}} options.tree
 * @param {FileSystemFileHandle} options.activeHandle
 * @param {string|null} options.activeDocumentName
 * @param {string|null} options.documentIdentity
 * @param {object|null} options.baseline
 * @param {object} options.current
 * @param {object} options.captured
 * @param {object} options.parent Result of resolveRenameParent
 * @param {string} options.proposedName
 * @param {string} [options.backend]
 * @param {object} [options.capability]
 * @param {string|null} [options.directMoveVerification]
 * @param {string|null} [options.overwriteSemanticsVerification]
 */
export function buildRenamePreflight({
  tree = null,
  activeHandle = null,
  activeDocumentName = null,
  documentIdentity = null,
  baseline = null,
  current = null,
  captured = null,
  parent = null,
  proposedName = '',
  backend = 'unknown',
  capability = null,
  directMoveVerification = null,
  overwriteSemanticsVerification = null
} = {}) {
  if (!tree || typeof tree.name !== 'string') return fail('invalid-tree', 'tree', 'A current map tree with a root title is required.');
  if (!activeHandle || activeHandle.kind !== 'file') return fail('invalid-active-handle', 'tree', 'A current writable file handle is required.');
  if (!parent || parent.ok !== true) {
    return fail(parent?.reason || 'unknown-parent', 'parent', parent?.message || 'The active file parent could not be verified.', { parent: parent || null });
  }
  if (!parent.entry || !parent.entry.handle) return fail('unknown-parent', 'parent', 'The verified parent has no current file entry.', { parent });
  if (!entryIsSource(parent.entry, parent, activeHandle)) return fail('parent-identity-mismatch', 'parent', 'The verified parent does not contain the active file handle.', { parent });
  if (!Array.isArray(parent.entries)) return fail('incomplete-enumeration', 'parent', 'Parent entries were not returned completely.', { parent });
  if (activeDocumentName !== null && activeDocumentName !== parent.entry.name) {
    return fail('stale-document-name', 'identity', 'The active document name no longer matches its directory entry.', {
      activeDocumentName, entryName: parent.entry.name
    });
  }
  if (!current || typeof current !== 'object' || !captured || typeof captured !== 'object') {
    return fail('missing-identity', 'identity', 'Current and captured document identity are required.');
  }
  for (const field of IDENTITY_FIELDS) {
    if (current[field] === undefined || captured[field] === undefined) return fail('missing-identity', 'identity', `Missing document identity field: ${field}.`);
    if (current[field] !== captured[field]) return identityFailure('The document changed before Rename Map could be prepared.', { field, expected: captured[field], actual: current[field] });
  }
  if (current.handle !== captured.handle || activeHandle !== current.handle) {
    return identityFailure('The active file handle changed before Rename Map could be prepared.');
  }
  if ((current.documentIdentity ?? null) !== (captured.documentIdentity ?? null) || documentIdentity !== (current.documentIdentity ?? null)) {
    return identityFailure('The active document identity changed before Rename Map could be prepared.');
  }
  if (!documentIdentity) return fail('missing-document-identity', 'identity', 'Rename Map requires a current .orbit document identity.');
  if (current.revision !== captured.revision) return identityFailure('The document revision changed before Rename Map could be prepared.');
  if (!isOrbitMapFilename(parent.entry.name)) return fail('unsupported-file', 'parent', 'The active file is not an .orbit map file.', { entryName: parent.entry.name });

  const currentTitle = tree.name.normalize('NFKC').trim();
  if (!currentTitle) return fail('invalid-current-title', 'tree', 'The current root title is empty.');
  const rawName = String(proposedName || '');
  const rawStem = rawName.normalize('NFKC').trim().replace(/(?:\.orbit)+$/i, '').trim();
  if (Array.from(rawStem).length > MAX_ORBIT_NAME_CODE_POINTS) {
    return fail('name-too-long', 'name', `Map name must be at most ${MAX_ORBIT_NAME_CODE_POINTS} characters.`, { field: 'name' });
  }
  const normalized = normalizeOrbitMapFilename(rawName);
  if (!normalized.ok) {
    return fail(normalized.reason || 'invalid-name', 'name', normalized.message || 'The proposed map name is invalid.', { field: normalized.field || 'name' });
  }
  const titleResult = validateName(normalized.base);
  if (!titleResult.ok) return fail(titleResult.reason || 'invalid-name', 'name', titleResult.message || 'The proposed root title is invalid.', { field: 'name' });
  const title = titleResult.name;
  const filename = normalized.filename;
  if (!filename.endsWith('.orbit') || filename.slice(0, -'.orbit'.length).toLowerCase().endsWith('.orbit')) {
    return fail('invalid-filename', 'name', 'The derived filename has an invalid extension.');
  }
  const requiresConfirmation = rawName.normalize('NFKC') !== title;

  const sourceEntries = parent.entries.filter((entry) => entry && entry.name);
  const sourceMatches = sourceEntries.filter((entry) => entryIsSource(entry, parent, activeHandle));
  if (sourceMatches.length !== 1) {
    return fail('source-identity-unverified', 'collision', 'The source entry could not be excluded unambiguously by handle identity.');
  }
  const sourceEntry = sourceMatches[0];
  const nextKey = orbitNameKey(filename);
  const collisions = [];
  for (const entry of sourceEntries) {
    if (entryIsSource(entry, parent, activeHandle)) continue;
    if (orbitNameKey(entry.name) === nextKey) {
      collisions.push(Object.freeze({ name: entry.name, kind: entryKind(entry) }));
    }
  }
  if (collisions.length > 0) {
    const first = collisions[0];
    return fail('destination-collision', 'collision', first.kind === 'directory'
      ? `A directory named “${first.name}” already exists at the proposed filename.`
      : `A file named “${first.name}” already exists at the proposed filename.`, { collisions });
  }

  const currentFilename = parent.entry.name;
  const titleChanged = currentTitle !== title;
  const filenameChanged = currentFilename !== filename;
  const kind = !titleChanged && !filenameChanged
    ? 'noop'
    : titleChanged && !filenameChanged
      ? 'title-only'
      : !titleChanged && filenameChanged
        ? 'filename-only'
        : 'both';
  const caseOnlyFilenameChange = filenameChanged && orbitNameKey(currentFilename) === nextKey;
  const normalizationEquivalentFilenameChange = filenameChanged
    && (currentFilename.normalize('NFKC') !== currentFilename || filename.normalize('NFKC') !== filename)
    && orbitNameKey(currentFilename) === nextKey;

  const resolvedCapability = capability || describeRenameCapability({
    fileHandle: activeHandle,
    parentHandle: parent.parent?.handle || null,
    backend,
    directMoveVerification,
    overwriteSemanticsVerification
  });

  return Object.freeze({
    ok: true,
    schema: 'fileorbit-rename-preflight-v1',
    readOnly: true,
    noop: kind === 'noop',
    kind,
    proposedName: rawName,
    title,
    filename,
    requiresConfirmation,
    current: Object.freeze({
      title: currentTitle,
      filename: currentFilename,
      handle: activeHandle,
      documentIdentity,
      datasetToken: current.datasetToken,
      session: current.session,
      ownership: current.ownership,
      revision: current.revision,
      savedRevision: current.savedRevision ?? null
    }),
    parent: Object.freeze({
      handle: parent.parent?.handle || parent.handle || null,
      name: parent.parent?.name || parent.name || '',
      libraryId: parent.parent?.libraryId ?? parent.libraryId ?? null,
      entry: Object.freeze({ name: sourceEntry.name, kind: entryKind(sourceEntry), handle: sourceEntry.handle })
    }),
    sourceEntry: Object.freeze({ name: sourceEntry.name, kind: entryKind(sourceEntry), handle: sourceEntry.handle }),
    change: Object.freeze({
      titleChanged,
      filenameChanged,
      caseOnlyFilenameChange,
      normalizationEquivalentFilenameChange,
      needsFilesystemRename: filenameChanged
    }),
    collisionCheck: Object.freeze({
      complete: true,
      scanned: sourceEntries.length,
      excludedSourceHandle: sourceEntry.handle,
      collisions: Object.freeze(collisions)
    }),
    baseline: baseline ? Object.freeze({
      present: true,
      handle: baseline.handle || null,
      documentIdentity: baseline.documentIdentity ?? null,
      digest: baseline.digest || null,
      size: Number.isFinite(baseline.size) ? baseline.size : null
    }) : Object.freeze({ present: false }),
    capability: resolvedCapability
  });
}
