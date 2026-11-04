import { safeDocumentFilename } from '../persistence/backup.js';

export const ORBIT_MAP_EXTENSION = '.orbit';
export const MAX_ORBIT_NAME_CODE_POINTS = 80;

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const DIRECTORY_INVALID = /[<>:"/\\|?*]/;
const RESERVED_WINDOWS = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function fail(reason, message, field = 'name') {
  return { ok: false, reason, field, message };
}

function codePointLength(value) { return Array.from(value).length; }

function reservedStem(name) {
  return String(name).normalize('NFKC').split('.')[0].trim();
}

function invalidReserved(name) {
  return RESERVED_WINDOWS.test(reservedStem(name));
}

/**
 * Validate a single top-level Orbit child-directory name.
 * Strict: separators/traversal/invalid characters are rejected, not silently rewritten.
 */
export function validateOrbitDirectoryName(value) {
  if (typeof value !== 'string') return fail('name-required', 'A directory name is required.');
  const name = value.normalize('NFKC').trim();
  if (!name) return fail('name-required', 'A directory name is required.');
  if (CONTROL.test(name)) return fail('name-control', 'The directory name contains a prohibited control character.');
  if (/[/\\]/.test(name)) return fail('name-separator', 'The directory name must not contain path separators.');
  if (name === '.' || name === '..') return fail('name-traversal', 'The directory name must not be a traversal segment.');
  if (DIRECTORY_INVALID.test(name)) return fail('name-invalid-character', 'The directory name contains a reserved filesystem character.');
  if (name.endsWith('.') || name.endsWith(' ')) return fail('name-trailing', 'The directory name must not end with a dot or space.');
  if (invalidReserved(name)) return fail('name-reserved', 'That directory name is reserved by the operating system.');
  if (codePointLength(name) > MAX_ORBIT_NAME_CODE_POINTS) return fail('name-too-long', `The directory name must be at most ${MAX_ORBIT_NAME_CODE_POINTS} characters.`);
  return { ok: true, name, key: orbitNameKey(name) };
}

/**
 * Normalize a map title into a safe top-level .orbit filename.
 * Path separators/traversal are rejected. Filesystem-reserved punctuation is
 * normalized by the existing FileOrbit filename sanitizer; reserved device
 * names are rejected because silently renaming them is unsafe.
 */
export function normalizeOrbitMapFilename(title) {
  if (typeof title !== 'string') return fail('name-required', 'A map title is required.');
  const raw = title.normalize('NFKC').trim();
  if (!raw) return fail('name-required', 'A map title is required.');
  if (CONTROL.test(raw)) return fail('name-control', 'The map title contains a prohibited control character.');
  if (/[/\\]/.test(raw)) return fail('name-separator', 'A map filename must not contain path separators.');
  const stripped = raw.replace(/(?:\.orbit)+$/i, '').trim();
  if (!stripped) return fail('name-required', 'A map title is required.');
  if (stripped === '.' || stripped === '..') return fail('name-traversal', 'A map filename must not be a traversal segment.');
  const filename = safeDocumentFilename(raw, ORBIT_MAP_EXTENSION);
  const base = filename.slice(0, -ORBIT_MAP_EXTENSION.length);
  if (!base) return fail('name-required', 'A map title is required.');
  if (base.endsWith('.') || base.endsWith(' ')) return fail('name-trailing', 'A map filename must not end with a dot or space.');
  if (invalidReserved(base)) return fail('name-reserved', 'That map filename is reserved by the operating system.');
  const normalizedBase = base.normalize('NFKC');
  if (codePointLength(normalizedBase) > MAX_ORBIT_NAME_CODE_POINTS) {
    return fail('name-too-long', `A map filename must be at most ${MAX_ORBIT_NAME_CODE_POINTS} characters.`);
  }
  return {
    ok: true,
    filename,
    base: normalizedBase,
    key: orbitNameKey(filename),
    adjusted: filename !== raw
  };
}

/** Case-insensitive comparison key for an Orbit directory or .orbit filename. */
export function orbitNameKey(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

/** Conservative case-insensitive collision lookup. Returns the existing name or null. */
export function findOrbitNameCollision(candidate, existingNames) {
  const key = orbitNameKey(candidate);
  for (const existing of existingNames || []) {
    if (orbitNameKey(existing) === key) return String(existing);
  }
  return null;
}

export function isOrbitMapFilename(value) {
  return typeof value === 'string' && /\.orbit$/i.test(value);
}
