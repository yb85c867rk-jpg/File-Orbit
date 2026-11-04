import { EMBED_SCHEMA, EMBED_VERSION, EMBED_READY_TYPE, EMBED_LOADED_TYPE, EMBED_ERROR_TYPE } from './embed-snapshot.js';

export function normalizeParentOrigin(value, fallback = '') {
  const candidate = String(value || fallback || '').trim();
  if (!candidate || candidate === '*' || candidate.toLowerCase() === 'null') throw new Error('A concrete parent origin is required.');
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new Error('Parent origin is malformed.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Parent origin must use http or https.');
  if (parsed.username || parsed.password) throw new Error('Parent origin cannot contain credentials.');
  if (parsed.origin === 'null' || !parsed.origin) throw new Error('Parent origin is not usable.');
  return parsed.origin;
}

export function isAllowedParentEvent(event, { expectedOrigin, parentWindow }) {
  return Boolean(event && event.source === parentWindow && event.origin === expectedOrigin && typeof event.origin === 'string');
}

function plain(data) { return data && typeof data === 'object' && !Array.isArray(data); }
function exactKeys(data, keys) {
  const own = Object.keys(data).sort();
  return own.length === keys.length && own.every((key, index) => key === [...keys].sort()[index]);
}

export function parseViewerReady(data) {
  if (!exactKeys(data, ['type', 'schema', 'version']) || data.type !== EMBED_READY_TYPE || data.schema !== EMBED_SCHEMA || data.version !== EMBED_VERSION) return null;
  return { type: data.type, schema: data.schema, version: data.version };
}
export function parseViewerLoaded(data) {
  if (!exactKeys(data, ['type', 'nodeCount', 'title']) || data.type !== EMBED_LOADED_TYPE || !Number.isInteger(data.nodeCount) || data.nodeCount < 1 || data.nodeCount > 300 || typeof data.title !== 'string' || data.title.length > 200) return null;
  return { nodeCount: data.nodeCount, title: data.title };
}
export function parseViewerError(data) {
  if (!exactKeys(data, ['type', 'message']) || data.type !== EMBED_ERROR_TYPE || typeof data.message !== 'string' || data.message.length > 300) return null;
  return { message: data.message };
}

export function validateHostSnapshotEvent(event, { parentOrigin, sourceWindow, maxBytes = 512 * 1024 }) {
  if (!isAllowedParentEvent(event, { expectedOrigin: parentOrigin, parentWindow: sourceWindow })) return { ok: false, reason: 'origin-or-source' };
  let data;
  try { data = JSON.parse(JSON.stringify(event.data)); } catch { return { ok: false, reason: 'payload' }; }
  if (!plain(data) || data.type !== 'fileorbit:embed:snapshot') return { ok: false, reason: 'message-type' };
  return { ok: true, data };
}
