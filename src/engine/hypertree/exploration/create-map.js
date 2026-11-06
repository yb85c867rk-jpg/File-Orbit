import { classifyFile } from '../editor/attachment-classification.js';
import { validateDescription } from '../editor/validation.js';
import { createAttachmentRegistry } from '../editor/attachments.js';
import { EDITOR_MAX_NODES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES, MAX_NAME_CODE_POINTS, nameKey, validateName } from '../editor/validation.js';
import { evaluateContextNodeAccess } from '../edition/context.js';

export const CREATE_MAP_CLASSIFY_CONCURRENCY = 4;

function fail(reason, message, extra = {}) { return { ok: false, reason, message, ...extra }; }

/** Validate and normalize a browser-relative path into safe segments. */
export function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return fail('path-required', 'The selected item has no relative path.');
  if (value.includes('\\')) return fail('path-ambiguous', 'The selected path contains an ambiguous separator.');
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return fail('path-absolute', 'Absolute paths are not supported.');
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return fail('path-malformed', 'The selected path contains an empty, current-directory, or traversal segment.');
  }
  const names = [];
  for (const segment of segments) {
    const checked = validateName(segment);
    if (!checked.ok) return fail(checked.reason, checked.message, { field: 'path' });
    names.push(checked.name);
  }
  return { ok: true, path: names.join('/'), segments: names };
}

function compareNames(left, right) {
  const a = nameKey(left); const b = nameKey(right);
  if (a < b) return -1; if (a > b) return 1;
  if (left < right) return -1; if (left > right) return 1;
  return 0;
}

/**
 * Build an isolated candidate tree from explicitly selected browser Files.
 * No File/Blob or object URL is stored in the tree.
 */
export async function prepareCreateMapCandidate({
  mapName,
  description = null,
  files = [],
  folders = [],
  datasetToken,
  isCurrent = () => true,
  classify = classifyFile,
  maxNodes = undefined,
  policyContext = undefined,
  maxFileBytes = MAX_ATTACHMENT_BYTES,
  maxTotalBytes = MAX_ATTACHMENT_TOTAL_BYTES,
  concurrency = CREATE_MAP_CLASSIFY_CONCURRENCY
} = {}) {
  const nameResult = validateName(mapName);
  if (!nameResult.ok) return fail(nameResult.reason, nameResult.message, { field: 'name' });
  const descriptionResult = validateDescription(description);
  if (!descriptionResult.ok) return fail(descriptionResult.reason, descriptionResult.message, { field: 'description' });
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) return fail('dataset-invalid', 'A fresh dataset identity is required.');
  if (!Array.isArray(files) || !Array.isArray(folders)) return fail('selection-invalid', 'The selection is invalid.');
  const budget = evaluateContextNodeAccess(policyContext, 1, maxNodes);
  if (!budget.ok) return fail(budget.reason === 'invalid-caller-limit' ? 'invalid-node-budget' : budget.reason, budget.message);
  const effectiveMaxNodes = budget.decision.effectiveLimit;

  let counter = 0;
  let nodeCount = 1;
  const idFor = () => `cm-${datasetToken.toString(36)}-${(counter++).toString(36)}`;
  const root = { id: idFor(), name: nameResult.name, kind: 'folder', data: { description: descriptionResult.value }, children: new Map() };
  const ensureFolder = (segments, path) => {
    let current = root;
    let walked = '';
    for (const segment of segments) {
      walked = walked ? `${walked}/${segment}` : segment;
      let child = current.children.get(nameKey(segment));
      if (child && child.kind !== 'folder') return fail('path-conflict', `A file and folder conflict at "${walked}".`);
      if (!child) {
        nodeCount += 1;
        if (nodeCount > effectiveMaxNodes) return fail('node-limit', `A map is limited to ${effectiveMaxNodes} nodes including its root.`);
        child = { id: idFor(), name: segment, kind: 'folder', data: {}, children: new Map() };
        current.children.set(nameKey(segment), child);
      }
      current = child;
    }
    return { ok: true, node: current, path };
  };

  const folderPaths = [];
  const seenFolderPaths = new Set();
  for (const value of folders) {
    const normalized = normalizeRelativePath(value);
    if (!normalized.ok) return normalized;
    const folderKey = normalized.path.normalize('NFC').toLowerCase();
    if (seenFolderPaths.has(folderKey)) return fail('duplicate-path', `The folder path "${normalized.path}" was selected more than once.`);
    seenFolderPaths.add(folderKey);
    folderPaths.push(normalized);
  }
  folderPaths.sort((a, b) => a.segments.length - b.segments.length || compareNames(a.path, b.path));
  for (const normalized of folderPaths) {
    const made = ensureFolder(normalized.segments, normalized.path);
    if (!made.ok) return made;
  }

  const seenFilePaths = new Set();
  const fileEntries = [];
  let totalBytes = 0;
  for (const entry of files) {
    const file = entry?.file || entry;
    if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') return fail('file-invalid', 'A selected item is not a readable File.');
    const normalized = normalizeRelativePath(entry?.relativePath || file.webkitRelativePath || file.name);
    if (!normalized.ok) return normalized;
    const key = normalized.path.normalize('NFC').toLowerCase();
    if (seenFilePaths.has(key)) return fail('duplicate-path', `The path "${normalized.path}" was selected more than once.`);
    seenFilePaths.add(key);
    if (file.size > maxFileBytes) return fail('attachment-too-large', `"${normalized.path}" exceeds the ${maxFileBytes}-byte file limit.`);
    totalBytes += file.size;
    if (totalBytes > maxTotalBytes) return fail('attachment-total-limit', `Selected files exceed the ${maxTotalBytes}-byte candidate attachment limit.`);
    let parent = root;
    if (normalized.segments.length > 1) {
      const made = ensureFolder(normalized.segments.slice(0, -1), normalized.path);
      if (!made.ok) return made;
      parent = made.node;
    }
    const leaf = normalized.segments.at(-1);
    if (parent.children.has(nameKey(leaf))) return fail('path-conflict', `A file or folder named "${leaf}" already exists at "${normalized.path}".`);
    nodeCount += 1;
    if (nodeCount > effectiveMaxNodes) return fail('node-limit', `A map is limited to ${effectiveMaxNodes} nodes including its root.`);
    const node = { id: idFor(), name: leaf, kind: 'file', data: null, children: [] };
    parent.children.set(nameKey(leaf), node);
    fileEntries.push({ node, file, path: normalized.path });
  }
  if (!isCurrent()) return fail('stale-selection', 'The selection changed before preparation completed.');

  const registry = createAttachmentRegistry({ datasetToken, maxFileBytes, maxTotalBytes });
  const releaseAll = () => registry.clear();
  const classifications = new Map();
  let cursor = 0;
  let firstError = null;
  const worker = async () => {
    while (!firstError) {
      if (!isCurrent()) { firstError = fail('stale-selection', 'The selection changed before preparation completed.'); return; }
      const index = cursor; cursor += 1;
      if (index >= fileEntries.length) return;
      const item = fileEntries[index];
      try {
        const classification = await classify(item.file);
        if (!isCurrent()) { firstError = fail('stale-selection', 'The selection changed before preparation completed.'); return; }
        classifications.set(item.path, classification);
      } catch (error) {
        firstError = fail('classification-failed', `Could not classify "${item.path}": ${String(error?.message || error)}`);
      }
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, fileEntries.length)) }, worker);
  await Promise.all(workers);
  if (firstError) { releaseAll(); return firstError; }
  if (!isCurrent()) { releaseAll(); return fail('stale-selection', 'The selection changed before preparation completed.'); }

  const serialize = (node) => {
    if (node.kind === 'folder') {
      const children = [...node.children.values()].sort((a, b) => compareNames(a.name, b.name));
      return { id: node.id, name: node.name, kind: 'folder', data: { ...node.data }, children: children.map(serialize) };
    }
    const classification = classifications.get(fileEntries.find((entry) => entry.node === node)?.path);
    const staged = registry.stage(node.file || fileEntries.find((entry) => entry.node === node).file, classification);
    if (!staged.ok) { firstError = staged; return null; }
    registry.commit(staged.id);
    node.data = {
      dataType: 'file', description: null, attachmentId: staged.id,
      originalName: staged.metadata.originalName, sizeBytes: staged.metadata.sizeBytes,
      mime: staged.metadata.mime, classification: staged.metadata.classification
    };
    return { id: node.id, name: node.name, kind: 'file', data: { ...node.data } };
  };
  const children = [];
  for (const child of [...root.children.values()].sort((a, b) => compareNames(a.name, b.name))) {
    const built = serialize(child);
    if (firstError) { releaseAll(); return firstError; }
    children.push(built);
  }
  if (!isCurrent()) { releaseAll(); return fail('stale-selection', 'The selection changed before preparation completed.'); }
  const tree = { id: root.id, name: root.name, kind: 'folder', data: { ...root.data }, children };
  let folderCount = 0; let fileCount = 0;
  const count = (node) => { if (node.kind === 'folder') folderCount += 1; else fileCount += 1; for (const child of node.children || []) count(child); };
  count(tree);
  return { ok: true, tree, registry, datasetToken, stats: { nodeCount, folderCount, fileCount, totalBytes, classificationCount: classifications.size } };
}




