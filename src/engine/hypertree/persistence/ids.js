import { persistenceError } from './schema.js';

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{8,127}$/;
const MAP_PREFIX = 'map_';
const ATTACHMENT_PREFIX = 'att_';
const WORKSPACE_PREFIX = 'ws_';
const WORKSPACE_TOKEN_PREFIX = 'wst_';
const CHECKPOINT_PREFIX = 'chk_';
const SAVE_PREFIX = 'sv_';
const CLAIM_PREFIX = 'clm_';

function randomHex(bytes = 16, cryptoObject = globalThis.crypto) {
  if (!cryptoObject) throw persistenceError('crypto-unavailable', 'Secure random identity generation is unavailable.');
  const data = new Uint8Array(bytes);
  if (typeof cryptoObject.getRandomValues === 'function') cryptoObject.getRandomValues(data);
  else throw persistenceError('crypto-unavailable', 'Secure random identity generation is unavailable.');
  return [...data].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function uuidFromCrypto(cryptoObject = globalThis.crypto) {
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
  return randomHex(16, cryptoObject);
}

export function isPersistentId(value, prefix = null) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) return false;
  return prefix === null || value.startsWith(prefix);
}

export function createMapId(cryptoObject = globalThis.crypto) {
  return `${MAP_PREFIX}${uuidFromCrypto(cryptoObject)}`;
}

export function createAttachmentId(cryptoObject = globalThis.crypto) {
  return `${ATTACHMENT_PREFIX}${uuidFromCrypto(cryptoObject)}`;
}

export function createRecoveryId(prefix, cryptoObject = globalThis.crypto) {
  return `${prefix}${uuidFromCrypto(cryptoObject)}`;
}

export function assertMapId(value) {
  if (!isPersistentId(value, MAP_PREFIX)) throw persistenceError('invalid-map-id', 'Persistent map ID is invalid.');
  return value;
}

export function assertAttachmentId(value) {
  if (!isPersistentId(value, ATTACHMENT_PREFIX)) throw persistenceError('invalid-attachment-id', 'Persistent attachment ID is invalid.');
  return value;
}

export function createRecoveryWorkspaceId(cryptoObject) { return createRecoveryId(WORKSPACE_PREFIX, cryptoObject); }
export function createRecoveryWorkspaceToken(cryptoObject) { return createRecoveryId(WORKSPACE_TOKEN_PREFIX, cryptoObject); }
export function createRecoveryCheckpointId(cryptoObject) { return createRecoveryId(CHECKPOINT_PREFIX, cryptoObject); }
export function createRecoverySaveId(cryptoObject) { return createRecoveryId(SAVE_PREFIX, cryptoObject); }
export function createRecoveryClaimId(cryptoObject) { return createRecoveryId(CLAIM_PREFIX, cryptoObject); }
export function isRecoveryWorkspaceId(value) { return isPersistentId(value, WORKSPACE_PREFIX); }
export function isRecoveryWorkspaceToken(value) { return isPersistentId(value, WORKSPACE_TOKEN_PREFIX); }
export function isRecoveryCheckpointId(value) { return isPersistentId(value, CHECKPOINT_PREFIX); }
export function isRecoverySaveId(value) { return isPersistentId(value, SAVE_PREFIX); }
export function isRecoveryClaimId(value) { return isPersistentId(value, CLAIM_PREFIX); }
