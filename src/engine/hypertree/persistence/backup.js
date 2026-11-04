/**
 *
 * Portable FileOrbit backup container.
 *
 * Header: "FILEORBIT" (9 ASCII bytes), containerVersion uint16 BE,
 * manifestLength uint32 BE. Fixed header size 15 bytes.
 * Manifest is strict UTF-8 JSON. Attachment offsets are relative to the
 * payload section (byte 15 + manifestLength). All integers are unsigned,
 * big-endian, and validated as safe integers.
 */
import { MAX_SAVED_MAP_ATTACHMENT_BYTES } from './schema.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';
import { cloneMetadata } from '../data/metadata.js';
import { loadTree } from '../data/tree-loader.js';
import { createAttachmentId } from './ids.js';

export const BACKUP_MAGIC = 'FILEORBIT';
export const BACKUP_VERSION = 1;
export const BACKUP_HEADER_BYTES = 15;
export const BACKUP_MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
export const BACKUP_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const BACKUP_MAX_TOTAL_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const BACKUP_SCHEMA_VERSION = 1;

const encoder = new TextEncoder();
const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value, prefix) => typeof value === 'string' && value.length > 0 && value.startsWith(prefix) && value.length <= 200;
const safe = (value) => Number.isSafeInteger(value) && value >= 0;
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (cryptoApi, blob) => {
  if (!cryptoApi?.subtle || typeof cryptoApi.subtle.digest !== 'function') fail('crypto-unavailable', 'SHA-256 is unavailable in this browser.');
  const bytes = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await blob.slice(0, blob.size).arrayBuffer();
  return hex(await cryptoApi.subtle.digest('SHA-256', bytes));
};

function collect(tree, registry) {
  const refs = new Map();
  let nodes = 0;
  const walk = (node) => {
    if (!isObject(node)) fail('invalid-tree', 'Backup tree node is invalid.');
    nodes += 1;
    if (node.data && typeof node.data.attachmentId === 'string') {
      const runtimeId = node.data.attachmentId;
      if (!refs.has(runtimeId)) {
        const record = registry?.get?.(runtimeId);
        if (!record || !record.file || typeof record.file.size !== 'number') fail('missing-attachment', 'A referenced attachment is missing.');
        refs.set(runtimeId, record);
      }
    }
    for (const child of node.children || []) walk(child);
  };
  walk(tree);
  return { refs, nodes };
}

function canonicalNode(node, packageIds, refs) {
  const out = {};
  for (const key of ['id', 'kind', 'name', 'children', 'data']) {
    if (node[key] === undefined) continue;
    if (key === 'children') out.children = node.children.map((child) => canonicalNode(child, packageIds, refs));
    else if (key === 'data') {
      const data = cloneMetadata(node.data || {});
      for (const dataKey of ['description', 'link', 'dataType', 'attachmentId']) {
        if (node.data?.[dataKey] !== undefined) data[dataKey] = dataKey === 'attachmentId' ? packageIds.get(node.data[dataKey]) : node.data[dataKey];
      }
      if (node.data?.attachmentId) {
        const record = refs.get(node.data.attachmentId); const meta = record.metadata || {};
        const originalName = meta.originalName || record.name || 'attachment';
        const sizeBytes = record.file.size;
        const mime = meta.mime || record.file.type || '';
        if (node.data.originalName !== undefined && node.data.originalName !== originalName) fail('attachment-metadata-mismatch', 'Node originalName contradicts its attachment.');
        if (node.data.sizeBytes !== undefined && node.data.sizeBytes !== sizeBytes) fail('attachment-size-mismatch', 'Node size contradicts its attachment.');
        if (node.data.mime !== undefined && String(node.data.mime).toLowerCase() !== String(mime).toLowerCase()) fail('attachment-metadata-mismatch', 'Node MIME contradicts its attachment.');
        if (node.data.classification !== undefined && JSON.stringify(node.data.classification) !== JSON.stringify(meta.classification ?? record.classification ?? null)) fail('attachment-metadata-mismatch', 'Node classification contradicts its attachment.');
        data.originalName = originalName;
        data.sizeBytes = sizeBytes;
        data.mime = mime;
        data.classification = cloneMetadata(meta.classification ?? record.classification ?? node.data.classification ?? null);
      }
      out.data = data;
    } else out[key] = node[key];
  }
  return out;
}

export async function encodeBackup({ tree, registry, mapName, sourceMapId = null, now = new Date(), cryptoApi = globalThis.crypto, limits = {}, policyContext = undefined, isCancelled = () => false } = {}) {
  if (isCancelled()) fail('backup-cancelled', 'Backup preparation was cancelled.');
  if (!isObject(tree)) fail('invalid-tree', 'A committed tree is required.');
  if (!registry || typeof registry.get !== 'function') fail('invalid-registry', 'The attachment registry is required.');
  const { refs, nodes } = collect(tree, registry);
  const nodeLimit = resolveSavedMapNodeLimit(limits.maxNodes, policyContext);
  if (!nodeLimit.ok) fail(nodeLimit.reason, nodeLimit.message);
  const maxNodes = nodeLimit.limit;
  const maxTotal = limits.maxTotalAttachmentBytes || BACKUP_MAX_TOTAL_ATTACHMENT_BYTES;
  const maxFile = limits.maxFileBytes || BACKUP_MAX_FILE_BYTES;
  if (nodes > maxNodes) fail('node-limit', `Maps are limited to ${maxNodes} nodes.`);
  const packageIds = new Map();
  const entries = [];
  let totalBytes = 0;
  let index = 0;
  for (const [runtimeId, record] of refs) {
    const size = Number(record.file.size);
    if (!safe(size)) fail('attachment-size-invalid', 'Attachment size is invalid.');
    if (size > maxFile) fail('attachment-file-limit', 'Attachment exceeds the per-file backup limit.');
    totalBytes += size;
    if (totalBytes > maxTotal) fail('attachment-total-limit', 'Attachment payload exceeds the backup limit.');
    const packageId = 'att_p' + (++index);
    packageIds.set(runtimeId, packageId);
    entries.push({ runtimeId, packageId, size, file: record.file, originalName: record.metadata?.originalName || record.name || 'attachment', mime: record.metadata?.mime || record.file.type || '', classification: cloneMetadata(record.metadata?.classification ?? record.classification ?? null) });
  }
  const snapshotTree = canonicalNode(tree, packageIds, refs);
  const attachments = [];
  for (const entry of entries) {
    if (isCancelled()) fail('backup-cancelled', 'Backup preparation was cancelled.');
    let fileBlob; let digest;
    try {
      fileBlob = entry.file instanceof Blob ? entry.file : new Blob([await entry.file.slice(0, entry.size).arrayBuffer()], { type: entry.file.type || '' });
      digest = await sha256(cryptoApi, fileBlob);
    } catch (error) {
      fail('attachment-read-failed', 'Attachment ' + entry.originalName + ' (' + entry.runtimeId + ') could not be read during document encoding: ' + String(error?.name || 'Error') + ': ' + String(error?.message || error));
    }
    if (isCancelled()) fail('backup-cancelled', 'Backup preparation was cancelled.');
    attachments.push({ attachmentId: entry.packageId, runtimeId: entry.runtimeId, offset: 0, length: entry.size, originalName: entry.originalName, sizeBytes: entry.size, mime: entry.mime, classification: entry.classification, sha256: digest, blob: fileBlob });
  }
  let offset = 0;
  for (const item of attachments) { item.offset = offset; offset += item.length; }
  const manifestBase = {
    containerVersion: BACKUP_VERSION,
    appSchemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now instanceof Date ? now.toISOString() : String(now),
    mapName: String(mapName || 'FileOrbit map').slice(0, 200),
    sourceMapId: sourceMapId || null,
    nodeCount: nodes,
    tree: snapshotTree,
    attachments: attachments.map(({ runtimeId, blob, ...rest }) => rest),
    totalAttachmentBytes: totalBytes,
    packageSize: 0
  };
  let manifestBytes;
  manifestBase.packageSize = 0;
  for (let stable = 0; stable < 16; stable += 1) {
    manifestBytes = encoder.encode(JSON.stringify(manifestBase));
    if (manifestBytes.length > BACKUP_MANIFEST_MAX_BYTES) fail('manifest-size', 'Backup manifest exceeds 2 MiB.');
    const candidate = BACKUP_HEADER_BYTES + manifestBytes.length + totalBytes;
    if (manifestBase.packageSize === candidate) break;
    manifestBase.packageSize = candidate;
    if (stable === 15) fail('package-size', 'Backup package size did not stabilize.');
  }
  const finalSize = BACKUP_HEADER_BYTES + manifestBytes.length + totalBytes;
  if (manifestBase.packageSize !== finalSize) fail('package-size', 'Backup package size is inconsistent.');
  const header = new Uint8Array(BACKUP_HEADER_BYTES);
  header.set(encoder.encode(BACKUP_MAGIC), 0);
  new DataView(header.buffer).setUint16(9, BACKUP_VERSION, false);
  new DataView(header.buffer).setUint32(11, manifestBytes.length, false);
  const blob = new Blob([header, manifestBytes, ...attachments.map((item) => item.blob)], { type: 'application/x-orbit' });
  return { blob, manifest: manifestBase, manifestBytes, header, attachments, packageSize: BACKUP_HEADER_BYTES + manifestBytes.length + totalBytes };
}

export async function decodeBackup(blob, { cryptoApi = globalThis.crypto, limits = {}, policyContext = undefined, allocateAttachmentId = createAttachmentId, isCancelled = () => false } = {}) {
  if (isCancelled()) fail('backup-cancelled', 'Backup validation was cancelled.');
  if (blob.size < BACKUP_HEADER_BYTES) fail('truncated-header', 'The backup header is truncated.');
  const header = new Uint8Array(await blob.slice(0, BACKUP_HEADER_BYTES).arrayBuffer());
  const magic = new TextDecoder('utf-8', { fatal: true }).decode(header.slice(0, 9));
  if (magic !== BACKUP_MAGIC) fail('bad-magic', 'This is not a FileOrbit backup.');
  const version = new DataView(header.buffer).getUint16(9, false);
  if (version !== BACKUP_VERSION) fail('unsupported-version', `Unsupported backup version ${version}.`);
  const manifestLength = new DataView(header.buffer).getUint32(11, false);
  const manifestMax = limits.manifestMaxBytes || BACKUP_MANIFEST_MAX_BYTES;
  if (manifestLength < 2 || manifestLength > manifestMax) fail('manifest-size', 'The backup manifest size is invalid.');
  const payloadStart = BACKUP_HEADER_BYTES + manifestLength;
  if (payloadStart > blob.size) fail('truncated-manifest', 'The backup manifest is truncated.');
  let manifest;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await blob.slice(BACKUP_HEADER_BYTES, payloadStart).arrayBuffer());
    manifest = JSON.parse(text);
  } catch (error) {
    fail('manifest-invalid', `The backup manifest is not valid UTF-8 JSON: ${String(error?.message || error)}`);
  }
  if (!isObject(manifest) || manifest.containerVersion !== BACKUP_VERSION || manifest.appSchemaVersion !== BACKUP_SCHEMA_VERSION) fail('unsupported-schema', 'Unsupported backup schema.');
  if (!safe(manifest.packageSize) || manifest.packageSize !== blob.size) fail('package-size', 'Declared package size does not match the file.');
  if (!safe(manifest.nodeCount) || !safe(manifest.totalAttachmentBytes)) fail('summary-invalid', 'Backup summary is invalid.');
  const nodeLimit = resolveSavedMapNodeLimit(limits.maxNodes, policyContext);
  if (!nodeLimit.ok) fail(nodeLimit.reason, nodeLimit.message);
  const maxNodes = nodeLimit.limit;
  if (manifest.nodeCount < 1 || manifest.nodeCount > maxNodes) fail('node-limit', `Maps are limited to ${maxNodes} nodes.`);
  if (manifest.totalAttachmentBytes > (limits.maxTotalAttachmentBytes || MAX_SAVED_MAP_ATTACHMENT_BYTES)) fail('attachment-total-limit', 'Attachment payload exceeds the map limit.');
  if (!Array.isArray(manifest.attachments)) fail('attachments-invalid', 'Attachment list is invalid.');
  if (!isObject(manifest.tree)) fail('tree-invalid', 'Backup tree is invalid.');

  const packageIds = new Set();
  const ranges = [];
  let expectedOffset = 0;
  let total = 0;
  const maxFile = limits.maxFileBytes || BACKUP_MAX_FILE_BYTES;
  for (const item of manifest.attachments) {
    if (!isObject(item) || !isId(item.attachmentId, 'att_')) fail('attachment-id', 'Attachment ID is invalid.');
    if (packageIds.has(item.attachmentId)) fail('duplicate-attachment', 'Duplicate package attachment ID.');
    packageIds.add(item.attachmentId);
    if (!safe(item.offset) || !safe(item.length) || item.length > maxFile) fail('attachment-range', 'Attachment range is invalid.');
    if (item.offset !== expectedOffset) fail('attachment-gap', 'Attachment offsets must be contiguous.');
    if (!safe(item.sizeBytes) || item.sizeBytes !== item.length) fail('attachment-size', 'Attachment size does not match its range.');
    if (payloadStart + item.offset + item.length > blob.size) fail('attachment-out-of-bounds', 'Attachment range exceeds the package.');
    if (!/^[0-9a-f]{64}$/.test(String(item.sha256 || ''))) fail('hash-invalid', 'Attachment hash is invalid.');
    if (typeof item.originalName !== 'string') fail('name-invalid', 'Attachment name is invalid.');
    if (item.classification !== null && (!item.classification || typeof item.classification !== 'object' || typeof item.classification.format !== 'string')) fail('classification-invalid', 'Attachment classification is invalid.');
    expectedOffset += item.length; total += item.length;
    ranges.push(item);
  }
  if (total !== manifest.totalAttachmentBytes) fail('total-mismatch', 'Attachment total does not match.');
  if (payloadStart + total !== blob.size) fail('trailing-bytes', 'Package has trailing or missing bytes.');

  const seenRefs = new Set();
  let nodes = 0;
  const rewrite = (node) => {
    if (!isObject(node)) fail('tree-invalid', 'Tree node is invalid.');
    nodes += 1;
    const out = {};
    for (const key of ['id', 'kind', 'name', 'children', 'data']) {
      if (node[key] === undefined) continue;
      if (key === 'children') {
        if (!Array.isArray(node.children)) fail('tree-invalid', 'Children must be an array.');
        out.children = node.children.map(rewrite);
      } else if (key === 'data') {
        if (!isObject(node.data)) fail('tree-invalid', 'Node data is invalid.');
        out.data = cloneMetadata(node.data);
        if (node.data.attachmentId !== undefined) {
          const packageId = node.data.attachmentId;
          if (!packageIds.has(packageId)) fail('attachment-reference', 'Tree references an unknown attachment.');
          const item = ranges.find((entry) => entry.attachmentId === packageId);
          if (node.data.originalName !== undefined && node.data.originalName !== item.originalName) fail('attachment-metadata-mismatch', 'Node originalName does not match the manifest.');
          if (node.data.sizeBytes !== undefined && node.data.sizeBytes !== item.sizeBytes) fail('attachment-size-mismatch', 'Node size does not match the manifest.');
          if (node.data.mime !== undefined && String(node.data.mime).toLowerCase() !== String(item.mime || '').toLowerCase()) fail('attachment-metadata-mismatch', 'Node MIME does not match the manifest.');
          if (node.data.classification !== undefined && JSON.stringify(node.data.classification) !== JSON.stringify(item.classification)) fail('attachment-metadata-mismatch', 'Node classification does not match the manifest.');
          out.data.originalName = item.originalName;
          out.data.sizeBytes = item.sizeBytes;
          out.data.mime = String(item.mime || '');
          out.data.classification = item.classification;
          seenRefs.add(packageId);
        }
      } else out[key] = node[key];
    }
    return out;
  };
  const rewritten = rewrite(manifest.tree);
  if (nodes !== manifest.nodeCount) fail('node-count', 'Node count does not match the tree.');
  if (seenRefs.size !== packageIds.size) fail('unused-attachment', 'Backup contains unused attachments.');
  try { loadTree(rewritten, { limits: { maxNodes } }); } catch (error) { fail('tree-invalid', `Backup tree is invalid: ${String(error?.message || error)}`); }

  const attachments = [];
  for (const item of ranges) {
    if (isCancelled()) fail('backup-cancelled', 'Backup validation was cancelled.');
    const attachmentBlob = blob.slice(payloadStart + item.offset, payloadStart + item.offset + item.length);
    let attachmentBytes;
    try { attachmentBytes = await attachmentBlob.arrayBuffer(); }
    catch (error) { fail('attachment-read-failed', 'Attachment ' + item.originalName + ' (' + item.attachmentId + ') could not be read during decode: ' + String(error?.name || 'Error') + ': ' + String(error?.message || error)); }
    const detachedBlob = new Blob([attachmentBytes], { type: String(item.mime || '') });
    const digest = await sha256(cryptoApi, detachedBlob);
    if (isCancelled()) fail('backup-cancelled', 'Backup validation was cancelled.');
    if (digest !== item.sha256.toLowerCase()) fail('hash-mismatch', 'Attachment ' + item.originalName + ' failed integrity verification.');
    attachments.push({ attachmentId: item.attachmentId, blob: detachedBlob, metadata: {
      originalName: item.originalName, sizeBytes: item.length, mime: String(item.mime || ''),
      classification: item.classification
    } });
  }
  const idMap = new Map();
  const allocatedIds = new Set();
  for (const item of attachments) { const next = allocateAttachmentId(); if (!isId(next, 'att_') || allocatedIds.has(next)) fail('attachment-id', 'Fresh attachment ID allocation failed.'); allocatedIds.add(next); idMap.set(item.attachmentId, next); }
  const remap = (node) => {
    const out = { ...node };
    if (node.data?.attachmentId) out.data = { ...node.data, attachmentId: idMap.get(node.data.attachmentId) };
    if (node.children) out.children = node.children.map(remap);
    return out;
  };
  const liveTree = remap(rewritten);
  return { manifest, tree: liveTree, attachments: attachments.map((item) => ({ ...item, attachmentId: idMap.get(item.attachmentId) })) };
}

export function safeDocumentFilename(name, extension = '.orbit') {
  let base = String(name || 'FileOrbit map').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().replace(/\s+/g, ' ');
  base = base.replace(/(?:\.orbit)+$/i, '').slice(0, 80).trim() || 'FileOrbit map';
  return base + extension;
}
export function safeBackupFilename(name) { return safeDocumentFilename(name, '.orbit'); }














