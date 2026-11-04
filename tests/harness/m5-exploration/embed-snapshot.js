export const EMBED_SCHEMA = 'fileorbit.embed.snapshot';
export const EMBED_VERSION = 1;
export const EMBED_MAX_NODES = 300;
export const EMBED_MAX_BYTES = 512 * 1024;
export const EMBED_MAX_DEPTH = 32;
export const EMBED_MAX_CHILDREN = 300;
export const EMBED_MAX_NAME_LENGTH = 200;
export const EMBED_MAX_DESCRIPTION_LENGTH = 1000;
export const EMBED_MAX_ID_LENGTH = 128;
export const EMBED_MESSAGE_TYPE = 'fileorbit:embed:snapshot';
export const EMBED_READY_TYPE = 'fileorbit:embed:ready';
export const EMBED_LOADED_TYPE = 'fileorbit:embed:loaded';
export const EMBED_ERROR_TYPE = 'fileorbit:embed:error';

export class EmbedSnapshotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EmbedSnapshotError';
    this.code = code;
  }
}

const TOP_LEVEL_FIELDS = new Set(['schema', 'version', 'title', 'tree']);
const NODE_FIELDS = new Set(['id', 'name', 'kind', 'data', 'children']);
const DATA_FIELDS = new Set(['description']);

function fail(code, message) { throw new EmbedSnapshotError(code, message); }
const encoder = new TextEncoder();
export function utf8ByteLength(value) { return encoder.encode(String(value)).length; }
function messageBytes(data) {
  let text;
  try { text = JSON.stringify(data); } catch { fail('invalid-message', 'embed message is not JSON-serializable'); }
  return utf8ByteLength(text);
}
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function ownFields(value, allowed, code, label) {
  if (!isPlainObject(value)) fail(code, `${label} must be a plain object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${label} contains unsupported field ${key}`);
}
function boundedString(value, max, code, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) fail(code, `${label} must be a bounded non-empty string`);
  return value;
}
function sanitizeData(value, label) {
  if (value === undefined) return Object.freeze({});
  ownFields(value, DATA_FIELDS, 'invalid-data', label);
  const data = {};
  if (Object.prototype.hasOwnProperty.call(value, 'description')) data.description = boundedString(value.description, EMBED_MAX_DESCRIPTION_LENGTH, 'invalid-description', `${label}.description`);
  return Object.freeze(data);
}

/**
 * Validate and clone the versioned, explicitly bounded read-only embed snapshot.
 * No paths, handles, credentials, attachments, or arbitrary metadata survive.
 */
export function sanitizeEmbedSnapshot(input) {
  ownFields(input, TOP_LEVEL_FIELDS, 'invalid-snapshot', 'snapshot');
  if (input.schema !== EMBED_SCHEMA) fail('unsupported-schema', 'snapshot.schema is not supported');
  if (input.version !== EMBED_VERSION) fail('unsupported-version', 'snapshot.version is not supported');
  const title = boundedString(input.title, EMBED_MAX_NAME_LENGTH, 'invalid-title', 'snapshot.title');
  const seen = new Set();
  let count = 0;
  const visit = (node, depth, path) => {
    ownFields(node, NODE_FIELDS, 'invalid-node', path);
    if (depth > EMBED_MAX_DEPTH) fail('depth-limit', `${path} exceeds the embed depth limit`);
    const id = boundedString(node.id, EMBED_MAX_ID_LENGTH, 'invalid-id', `${path}.id`);
    if (seen.has(id)) fail('duplicate-id', `${path}.id duplicates an earlier node`);
    seen.add(id);
    count += 1;
    if (count > EMBED_MAX_NODES) fail('node-limit', `embed snapshot exceeds ${EMBED_MAX_NODES} nodes`);
    const kind = node.kind;
    if (kind !== 'folder' && kind !== 'file') fail('invalid-kind', `${path}.kind must be folder or file`);
    if (depth === 0 && kind !== 'folder') fail('invalid-root', 'embed root must be a folder');
    const name = boundedString(node.name, EMBED_MAX_NAME_LENGTH, 'invalid-name', `${path}.name`);
    const data = sanitizeData(node.data, `${path}.data`);
    const result = { id, name, kind, data };
    if (node.children !== undefined) {
      if (kind !== 'folder') fail('invalid-children', `${path}.children is only valid for folders`);
      if (!Array.isArray(node.children)) fail('invalid-children', `${path}.children must be an array`);
      if (node.children.length > EMBED_MAX_CHILDREN) fail('children-limit', `${path}.children exceeds ${EMBED_MAX_CHILDREN}`);
      result.children = node.children.map((child, index) => visit(child, depth + 1, `${path}.children[${index}]`));
    } else if (kind === 'folder') result.children = [];
    return Object.freeze(result);
  };
  const tree = visit(input.tree, 0, 'snapshot.tree');
  return Object.freeze({ schema: EMBED_SCHEMA, version: EMBED_VERSION, title, tree, nodeCount: count });
}

export function buildEmbedSnapshotMessage(input, { maxBytes = EMBED_MAX_BYTES } = {}) {
  const snapshot = sanitizeEmbedSnapshot(input);
  const message = Object.freeze({ type: EMBED_MESSAGE_TYPE, schema: EMBED_SCHEMA, version: EMBED_VERSION, snapshot: Object.freeze({ schema: snapshot.schema, version: snapshot.version, title: snapshot.title, tree: snapshot.tree }) });
  if (messageBytes(message) > maxBytes) fail('payload-limit', `embed message exceeds ${maxBytes} UTF-8 bytes`);
  return message;
}

export function parseEmbedSnapshotMessage(data, { maxBytes = EMBED_MAX_BYTES } = {}) {
  if (!isPlainObject(data)) fail('invalid-message', 'embed message must be an object');
  if (data.type !== EMBED_MESSAGE_TYPE) fail('invalid-message-type', 'embed message type is not supported');
  if (data.schema !== EMBED_SCHEMA || data.version !== EMBED_VERSION) fail('unsupported-schema', 'embed message schema/version is not supported');
  if (messageBytes(data) > maxBytes) fail('payload-limit', `embed message exceeds ${maxBytes} UTF-8 bytes`);
  return sanitizeEmbedSnapshot(data.snapshot);
}

export function embedSnapshotFromTree(tree, { title = 'Embedded FileOrbit map' } = {}) {
  return sanitizeEmbedSnapshot({ schema: EMBED_SCHEMA, version: EMBED_VERSION, title, tree });
}
