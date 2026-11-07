import { classifyFile, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../editor/attachment-classification.js';
import { createAttachmentRegistry } from '../editor/attachments.js';
import { countTreeNodes, createEditorIdAllocator, findNodeWithParent, nameKey, validateName } from '../editor/validation.js';
import { evaluateContextNodeAccess } from '../edition/context.js';
import { normalizeRelativePath } from './create-map.js';
import { cloneTree, findTreeNode } from './reparent.js';

const stale = (reason, message) => ({ ok: false, reason, message, stale: true });
const fail = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra });

function currentCheck(isCurrent) {
  if (typeof isCurrent !== 'function') return true;
  try { return isCurrent() !== false; } catch { return false; }
}

function highestCounter(ids, prefix) {
  let highest = -1;
  for (const id of ids) {
    if (typeof id !== 'string' || !id.startsWith(prefix)) continue;
    const value = Number.parseInt(id.slice(prefix.length), 36);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }
  return highest + 1;
}

function nodeIds(tree) {
  const ids = [];
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (node?.id) ids.push(node.id);
    for (const child of node?.children || []) stack.push(child);
  }
  return ids;
}

function destinationPath(destinationId, tree) {
  const path = [];
  const walk = (node, trail) => {
    if (node.id === destinationId) { path.push(...trail, node.name); return true; }
    for (const child of node.children || []) if (walk(child, [...trail, node.name])) return true;
    return false;
  };
  walk(tree, []);
  return path.join('/');
}

function makePlan() {
  const root = { kind: 'folder', name: '', children: new Map(), path: '', file: null };
  const nodeFor = (segments, isFile = false, file = null) => {
    let current = root;
    let path = '';
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      path = path ? `${path}/${segment}` : segment;
      const key = nameKey(segment);
      let child = current.children.get(key);
      const leaf = index === segments.length - 1;
      if (child) {
        if (!leaf) {
          if (child.kind !== 'folder') return { ok: false, reason: 'name-collision', path, message: `“${path}” conflicts with a file.` };
          current = child;
          continue;
        }
        return { ok: false, reason: 'name-collision', path, message: `“${path}” appears more than once in this upload.` };
      }
      if (leaf && isFile) {
        child = { kind: 'file', name: segment, children: new Map(), path, file };
      } else {
        child = { kind: 'folder', name: segment, children: new Map(), path, file: null };
      }
      current.children.set(key, child);
      current = child;
    }
    return { ok: true, node: current };
  };
  return { root, nodeFor };
}

function planCounts(plan) {
  let folders = 0; let files = 0;
  const visit = (node) => {
    if (node.kind === 'folder') folders += 1; else files += 1;
    for (const child of node.children.values()) visit(child);
  };
  for (const child of plan.root.children.values()) visit(child);
  return { folders, files };
}

function collectPlanFiles(node, out = []) {
  if (node.kind === 'file') out.push(node);
  for (const child of node.children.values()) collectPlanFiles(child, out);
  return out;
}

function collectPlanFolders(node, out = []) {
  if (node.kind === 'folder') out.push(node);
  for (const child of node.children.values()) collectPlanFolders(child, out);
  return out;
}

function nodeDepth(tree, id, depth = 0) {
  if (!tree) return -1;
  if (tree.id === id) return depth;
  for (const child of tree.children || []) {
    const found = nodeDepth(child, id, depth + 1);
    if (found >= 0) return found;
  }
  return -1;
}

function planDepth(node, depth = 0) {
  let deepest = depth;
  for (const child of node.children.values()) deepest = Math.max(deepest, planDepth(child, depth + 1));
  return deepest;
}

/**
 * Prepare local files/folders for addition beneath an existing folder.
 *
 * Input contract:
 * - tree/registry are authoritative read-only sources.
 * - destinationId, datasetToken, revision, expected* and policyContext identify
 *   the captured document state and edition budget.
 * - files are `{ file, relativePath }`; folders are relative path strings.
 * - sourceFolderName retains the picked folder as a child of destination.
 * - folderListingComplete can be false when the picker cannot expose empty
 *   folders. Supplied empty folders are always included; preparation never
 *   silently drops them. A false value is reported in the result summary.
 * - isCurrent is checked across asynchronous classification/staging.
 *
 * Result contract for D2:
 * - candidateTree is a full clone containing all existing hidden nodes plus the
 *   prepared addition. It is not installed and is not an editable owner.
 * - attachmentRegistry contains staging-only new attachments. Existing live
 *   attachments stay in the live registry.
 * - addition/ownership/summary describe the exact nodes, bindings and counts.
 * - dispose() is idempotent and clears only staged attachments. D2 must
 *   revalidate ownership and install through its existing editor transaction.
 *
 * The source tree and registry are never mutated.
 */

export async function prepareUploadAddition({
  tree,
  registry,
  destinationId,
  datasetToken,
  revision,
  expectedDatasetToken,
  expectedRevision,
  expectedDestinationId = destinationId,
  policyContext = undefined,
  maxNodes = undefined,
  files = [],
  folders = [],
  sourceFolderName = null,
  folderListingComplete = null,
  isCurrent = () => true,
  classify = classifyFile,
  maxFileBytes = MAX_ATTACHMENT_BYTES,
  maxTotalBytes = MAX_ATTACHMENT_TOTAL_BYTES,
  allocatorCounter = null
} = {}) {
  if (!tree || typeof tree !== 'object') return fail('missing-tree', 'The source tree is required.');
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) return fail('invalid-dataset', 'A valid dataset identity is required.');
  if (!Number.isSafeInteger(revision) || revision < 0) return fail('invalid-revision', 'A valid document revision is required.');
  if (datasetToken !== expectedDatasetToken) return stale('stale-dataset', 'The document dataset changed. Reopen the upload.');
  if (revision !== expectedRevision) return stale('stale-revision', 'The document revision changed. Reopen the upload.');
  if (destinationId !== expectedDestinationId) return stale('stale-destination', 'The upload destination changed.');
  if (!currentCheck(isCurrent)) return stale('stale-operation', 'The upload preparation was cancelled.');

  const destination = findTreeNode(tree, destinationId);
  if (!destination) return fail('destination-not-found', 'The destination folder no longer exists.');
  if (destination.kind !== 'folder') return fail('destination-not-folder', 'Uploads can only be added beneath a folder.');
  const sourceRoot = findNodeWithParent(tree, destinationId);
  if (!sourceRoot) return fail('destination-not-found', 'The destination folder no longer exists.');

  const plan = makePlan();
  const sourceName = sourceFolderName === null || sourceFolderName === undefined || sourceFolderName === ''
    ? null
    : validateName(sourceFolderName);
  if (sourceName && !sourceName.ok) return { ...sourceName, reason: sourceName.reason, message: sourceName.message, path: sourceFolderName };
  let prefixSegments = [];
  if (sourceName?.ok) {
    const made = plan.nodeFor([sourceName.name]);
    if (!made.ok) return fail(made.reason, made.message, { path: made.path });
    prefixSegments = [sourceName.name];
  }

  const folderInputs = [];
  for (const entry of folders || []) {
    const value = typeof entry === 'string' ? entry : entry?.path;
    const normalized = normalizeRelativePath(value);
    if (!normalized.ok) return { ...normalized, reason: normalized.reason, message: normalized.message, path: value };
    folderInputs.push(normalized.segments);
  }
  folderInputs.sort((left, right) => left.length - right.length || left.join('/').localeCompare(right.join('/')));
  for (const segments of folderInputs) {
    const made = plan.nodeFor([...prefixSegments, ...segments]);
    if (!made.ok) return fail(made.reason, made.message, { path: made.path });
  }

  const fileInputs = [];
  for (const entry of files || []) {
    const file = entry?.file || entry;
    if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') return fail('file-invalid', 'A selected item is not a readable File.');
    const rawPath = entry?.relativePath || file.webkitRelativePath || file.name;
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized.ok) return { ...normalized, reason: normalized.reason, message: normalized.message, path: rawPath };
    fileInputs.push({ file, segments: normalized.segments, path: normalized.path });
  }
  for (const entry of fileInputs) {
    const made = plan.nodeFor([...prefixSegments, ...entry.segments], true, entry.file);
    if (!made.ok) return fail(made.reason, made.message, { path: made.path });
  }

  const counts = planCounts(plan);
  if (counts.folders + counts.files === 0) return fail('empty-upload', 'Select at least one file or folder to upload.');
  const destinationDepth = nodeDepth(tree, destinationId);
  if (destinationDepth >= 0 && destinationDepth + planDepth(plan.root) > 64) {
    return fail('depth-limit', 'Adding these items would exceed the accepted depth limit.', { path: destinationPath(destinationId, tree) });
  }
  const existingNodeCount = countTreeNodes(tree);
  const resultingNodeCount = existingNodeCount + counts.folders + counts.files;
  const access = evaluateContextNodeAccess(policyContext, resultingNodeCount, maxNodes);
  if (!access.ok) return fail(access.reason, access.message);
  if (!access.decision.allowed) {
    return fail('node-limit', `Adding these items would exceed ${access.decision.effectiveLimit} nodes.`, {
      limit: access.decision.effectiveLimit,
      existingNodeCount,
      addedNodeCount: counts.folders + counts.files,
      resultingNodeCount
    });
  }

  for (const existing of destination.children || []) {
    const planned = plan.root.children.get(nameKey(existing.name));
    if (planned) return fail('name-collision', `“${planned.path}” already exists in this folder.`, { path: planned.path });
  }

  const planFiles = collectPlanFiles(plan.root);
  const existingAttachmentBytes = Number(registry?.totalBytes) || 0;
  const effectiveMaxFileBytes = Math.min(maxFileBytes, Number(registry?.maxFileBytes) || maxFileBytes);
  const effectiveMaxTotalBytes = Math.min(maxTotalBytes, Number(registry?.maxTotalBytes) || maxTotalBytes);
  let addedAttachmentBytes = 0;
  for (const planned of planFiles) {
    const size = Number(planned.file.size);
    if (!Number.isFinite(size) || size < 0) return fail('attachment-size-invalid', `“${planned.path}” has no valid size.`, { path: planned.path });
    if (size > effectiveMaxFileBytes) return fail('attachment-too-large', `“${planned.path}” exceeds the ${effectiveMaxFileBytes}-byte file limit.`, { path: planned.path, sizeBytes: size, limit: effectiveMaxFileBytes });
    addedAttachmentBytes += size;
    if (existingAttachmentBytes + addedAttachmentBytes > effectiveMaxTotalBytes) {
      return fail('attachment-total-limit', `Uploads would exceed the ${effectiveMaxTotalBytes}-byte attachment limit.`, {

        path: planned.path, limit: effectiveMaxTotalBytes, existingBytes: existingAttachmentBytes, addedBytes: addedAttachmentBytes
      });
    }
  }
  if (!currentCheck(isCurrent)) return stale('stale-operation', 'The upload preparation was cancelled.');

  let staging;
  try {
    const liveSnapshot = typeof registry?.snapshot === 'function' ? registry.snapshot() : [];
    const startCounter = highestCounter(liveSnapshot.map((entry) => entry?.attachmentId), `att-${datasetToken.toString(36)}-`);
    staging = createAttachmentRegistry({ datasetToken, maxFileBytes: effectiveMaxFileBytes, maxTotalBytes: effectiveMaxTotalBytes, counter: Math.max(0, startCounter) });
  } catch (error) {
    return fail('attachment-registry-failed', String(error?.message || error));
  }

  const staged = new Map();
  try {
    for (const planned of planFiles) {
      if (!currentCheck(isCurrent)) throw Object.assign(new Error('cancelled'), { reason: 'stale-operation' });
      let classification;
      try {
        classification = await classify(planned.file);
      } catch (error) {
        throw Object.assign(new Error('Could not classify “' + planned.path + '”: ' + String(error?.message || error)), { reason: 'classification-failed', path: planned.path });
      }
      if (!currentCheck(isCurrent)) throw Object.assign(new Error('cancelled'), { reason: 'stale-operation' });
      const result = staging.stage(planned.file, classification);
      if (!result.ok) throw Object.assign(new Error(result.message), { reason: result.reason, path: planned.path, extra: result });
      staged.set(planned.path, { record: result.record, metadata: result.metadata, node: planned });
    }
    if (!currentCheck(isCurrent)) throw Object.assign(new Error('cancelled'), { reason: 'stale-operation' });

    const candidateTree = cloneTree(tree);
    const candidateDestination = findNodeWithParent(candidateTree, destinationId)?.node;
    if (!candidateDestination) throw Object.assign(new Error('The destination folder no longer exists.'), { reason: 'destination-not-found' });
    const allIds = nodeIds(candidateTree);
    const startNodeCounter = allocatorCounter === null || allocatorCounter === undefined
      ? highestCounter(allIds, `fo-${datasetToken.toString(36)}-`)
      : allocatorCounter;
    const allocator = createEditorIdAllocator({ datasetToken, counter: Math.max(0, startNodeCounter) });
    const added = [];
    const build = (planNode, parent) => {
      const allocated = allocator.next(candidateTree);
      if (!allocated.ok) throw Object.assign(new Error('No stable ID is available for the new node.'), { reason: 'id-exhausted' });
      let node;
      if (planNode.kind === 'file') {
        const stagedFile = staged.get(planNode.path);
        if (!stagedFile) throw Object.assign(new Error('A staged attachment is missing.'), { reason: 'attachment-missing', path: planNode.path });
        const meta = stagedFile.metadata;
        node = {
          id: allocated.id,
          name: planNode.name,
          kind: 'file',
          data: {
            dataType: 'file',
            description: null,
            attachmentId: meta.attachmentId,
            originalName: meta.originalName,
            sizeBytes: meta.sizeBytes,
            mime: meta.mime,
            classification: meta.classification
          }
        };
      } else {
        node = { id: allocated.id, name: planNode.name, kind: 'folder', data: { description: null }, children: [] };
      }
      parent.children = parent.children || [];
      parent.children.push(node);
      added.push({ id: node.id, name: node.name, kind: node.kind, path: planNode.path, attachmentId: node.data?.attachmentId || null });
      for (const child of planNode.children.values()) build(child, node);
    };
    for (const child of plan.root.children.values()) build(child, candidateDestination);

    if (!currentCheck(isCurrent)) throw Object.assign(new Error('cancelled'), { reason: 'stale-operation' });
    if (datasetToken !== expectedDatasetToken || revision !== expectedRevision) throw Object.assign(new Error('stale ownership'), { reason: 'stale-revision' });

    let disposed = false;
    const result = {
      ok: true,
      candidateTree,
      datasetToken,
      revision,
      destinationId,
      destinationPath: destinationPath(destinationId, tree),
      attachmentRegistry: staging,
      addition: {
        nodes: added,
        attachments: [...staged.values()].map((entry) => ({ ...entry.metadata })),
        folders: counts.folders,
        files: counts.files
      },
      ownership: Object.freeze({ datasetToken, revision, destinationId, expectedDatasetToken, expectedRevision }),
      summary: {
        existingNodeCount,
        addedFolderCount: counts.folders,
        addedFileCount: counts.files,
        addedNodeCount: counts.folders + counts.files,
        resultingNodeCount,
        nodeLimit: access.decision.effectiveLimit,
        edition: access.context.edition,
        existingAttachmentBytes,
        addedAttachmentBytes,
        resultingAttachmentBytes: existingAttachmentBytes + addedAttachmentBytes,
        emptyFoldersIncluded: collectPlanFolders(plan.root).filter((node) => node.children.size === 0).length,
        sourceFolderIncluded: Boolean(sourceName?.ok),
        folderListingComplete: folderListingComplete === null || folderListingComplete === undefined ? null : Boolean(folderListingComplete)
      },
      dispose() {
        if (disposed) return false;
        disposed = true;
        staging.clear();
        return true;
      },
      get disposed() { return disposed; }
    };
    return result;
  } catch (error) {
    staging?.clear();
    const reason = error?.reason || 'upload-preparation-failed';
    if (reason === 'stale-operation') return stale(reason, 'The upload preparation was cancelled.');
    return fail(reason, String(error?.message || error), { path: error?.path, ...(error?.extra || {}) });
  }
}
