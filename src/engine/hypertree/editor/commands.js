import { cloneTree, findTreeNode } from '../exploration/reparent.js';
import { createEditorIdAllocator, findNodeWithParent, validateAddChild, validateDataEdit, validateFolderEdit, validateMetadataEdit, validateRename, validateEditorAdmission } from './validation.js';

/** Build a metadata-only rename candidate. No layout or graph mutation. */
export function buildRenameCommand({ tree, targetId, draftName, datasetToken, baseRevision, expectedDatasetToken, expectedRevision, policyContext = undefined, maxNodes = undefined }) {
  if (datasetToken !== expectedDatasetToken) {
    return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Reload the editor.' };
  }
  if (baseRevision !== expectedRevision) {
    return { ok: false, reason: 'stale-revision', message: 'The graph changed. Reopen the rename form.' };
  }
  const validation = validateRename({ tree, targetId, draftName, policyContext, maxNodes });
  if (!validation.ok) return { ...validation, layoutMode: 'preserve' };
  if (validation.noop) return { ...validation, layoutMode: 'preserve' };
  const candidateTree = cloneTree(tree);
  const node = findTreeNode(candidateTree, targetId);
  if (!node) return { ok: false, reason: 'stale-id', message: 'The node no longer exists.' };
  node.name = validation.name;
  return {
    ok: true,
    noop: false,
    candidateTree,
    targetId,
    name: validation.name,
    layoutMode: 'preserve'
  };
}
function stale(datasetToken, baseRevision, expectedDatasetToken, expectedRevision) {
  if (datasetToken !== expectedDatasetToken) return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Reload the editor.' };
  if (baseRevision !== expectedRevision) return { ok: false, reason: 'stale-revision', message: 'The graph changed. Reopen the editor form.' };
  return null;
}

export function buildAddChildCommand({
  tree, parentId, kind, draftName, draftDescription = null, draftLink = null, draftDataType = null, draftAttachment = null,
  parentDepth, baseLayoutDepth, datasetToken, baseRevision, expectedDatasetToken, expectedRevision,
  allocator = createEditorIdAllocator({ datasetToken }),
  policyContext = undefined,
  maxNodes = undefined
}) {
  const identityError = stale(datasetToken, baseRevision, expectedDatasetToken, expectedRevision);
  if (identityError) return identityError;
  const depth = parentDepth ?? baseLayoutDepth;
  if (Number.isSafeInteger(depth) && depth + 1 > 64) {
    return { ok: false, reason: 'depth-limit', message: 'Adding this node would exceed the accepted depth limit.' };
  }
  const validation = validateAddChild({ tree, parentId, kind, draftName, draftDescription, draftLink, draftDataType, draftAttachment, policyContext, maxNodes });
  if (!validation.ok) return validation;
  if (validation.parent.children && validation.parent.children.length >= 10000) {
    return { ok: false, reason: 'children-limit', message: 'The parent already has the maximum number of children.' };
  }
  const allocated = allocator.next(tree);
  if (!allocated.ok) return { ok: false, ...allocated, message: 'No stable ID is available for the new node.' };
  const candidateTree = cloneTree(tree);
  const parent = findNodeWithParent(candidateTree, parentId)?.node;
  if (!parent) return { ok: false, reason: 'stale-id', message: 'The parent folder no longer exists.' };
  const node = {
    id: allocated.id,
    name: validation.name,
    kind,
    data: Object.create(null)
  };
  if (kind === 'file') {
    node.data.dataType = validation.dataType;
    node.data.description = validation.description;
    if (validation.dataType === 'web-link') {
      node.data.link = validation.link;
    } else if (validation.dataType === 'file') {
      node.data.attachmentId = validation.attachment.attachmentId;
      node.data.originalName = validation.attachment.originalName;
      node.data.sizeBytes = validation.attachment.sizeBytes;
      node.data.mime = validation.attachment.mime;
      node.data.classification = validation.attachment.classification;
    }
  } else {
    node.data.description = validation.description;
    node.children = [];
  }
  parent.children = parent.children || [];
  parent.children.push(node);
  return { ok: true, noop: false, candidateTree, parentId, nodeId: node.id, selectId: node.id, kind, attachmentId: validation.attachment?.attachmentId ?? null, layoutMode: 'recompute' };
}

export function buildMetadataCommand({ tree, targetId, description, link, linkProvided = true, datasetToken, baseRevision, expectedDatasetToken, expectedRevision, policyContext = undefined, maxNodes = undefined }) {
  const identityError = stale(datasetToken, baseRevision, expectedDatasetToken, expectedRevision);
  if (identityError) return identityError;
  const validation = validateMetadataEdit({ tree, targetId, description, link, linkProvided, policyContext, maxNodes });
  if (!validation.ok) return { ...validation, layoutMode: 'preserve' };
  if (validation.noop) return { ...validation, layoutMode: 'preserve' };
  const candidateTree = cloneTree(tree);
  const found = findNodeWithParent(candidateTree, targetId);
  if (!found) return { ok: false, reason: 'stale-id', message: 'The data node no longer exists.' };
  const data = found.node.data || (found.node.data = Object.create(null));
  if (validation.description !== (typeof data.description === 'string' ? data.description : null)) data.description = validation.description;
  if (validation.dataType !== 'file' && validation.link !== (typeof data.link === 'string' ? data.link : null)) data.link = validation.link;
  return { ok: true, noop: false, candidateTree, targetId, layoutMode: 'preserve' };
}
export function buildEditFolderCommand({ tree, targetId, draftName, draftDescription, datasetToken, baseRevision, expectedDatasetToken, expectedRevision, policyContext = undefined, maxNodes = undefined }) {
  const identityError = stale(datasetToken, baseRevision, expectedDatasetToken, expectedRevision);
  if (identityError) return identityError;
  const validation = validateFolderEdit({ tree, targetId, draftName, draftDescription, policyContext, maxNodes });
  if (!validation.ok) return { ...validation, layoutMode: 'preserve' };
  if (validation.noop) return { ...validation, layoutMode: 'preserve', operation: 'edit-folder' };
  const candidateTree = cloneTree(tree);
  const found = findNodeWithParent(candidateTree, targetId);
  if (!found) return { ok: false, reason: 'stale-id', message: 'The folder no longer exists.' };
  found.node.name = validation.name;
  const data = found.node.data || (found.node.data = Object.create(null));
  if (validation.description !== (typeof data.description === 'string' ? data.description : null)) data.description = validation.description;
  return { ok: true, noop: false, candidateTree, targetId, layoutMode: 'preserve', operation: 'edit-folder' };
}

export function buildEditDataCommand({ tree, targetId, draftName, description, link, linkProvided = false, datasetToken, baseRevision, expectedDatasetToken, expectedRevision, policyContext = undefined, maxNodes = undefined }) {
  const identityError = stale(datasetToken, baseRevision, expectedDatasetToken, expectedRevision);
  if (identityError) return identityError;
  const validation = validateDataEdit({ tree, targetId, draftName, description, link, linkProvided, policyContext, maxNodes });
  if (!validation.ok) return { ...validation, layoutMode: 'preserve' };
  if (validation.noop) return { ...validation, layoutMode: 'preserve', operation: 'edit-data' };
  const candidateTree = cloneTree(tree);
  const found = findNodeWithParent(candidateTree, targetId);
  if (!found) return { ok: false, reason: 'stale-id', message: 'The data node no longer exists.' };
  found.node.name = validation.name;
  const data = found.node.data || (found.node.data = Object.create(null));
  data.description = validation.description;
  if (validation.dataType === 'web-link') data.link = validation.link;
  else if (validation.dataType === 'legacy') {
    if (validation.link === null) delete data.link; else data.link = validation.link;
  }
  return { ok: true, noop: false, candidateTree, targetId, layoutMode: 'preserve', operation: 'edit-data' };
}
export function buildDeleteCommand({ tree, targetId, structuralRootId, datasetToken, datasetTokenExpected, baseRevision, expectedRevision, baseLayout, viewBefore, policyContext = undefined, maxNodes = undefined }) {
  if (datasetToken !== datasetTokenExpected) return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Delete was rejected.' };
  if (baseRevision !== expectedRevision) return { ok: false, reason: 'stale-revision', message: 'The graph changed. Reopen the delete confirmation.' };
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  if (targetId === structuralRootId) return { ok: false, reason: 'root-protected', message: 'The structural root cannot be deleted.' };
  const found = findNodeWithParent(tree, targetId);
  if (!found || !found.parent) return { ok: false, reason: 'stale-id', message: 'The item no longer exists.' };
  if (found.node.kind !== 'folder' && found.node.kind !== 'file') return { ok: false, reason: 'unsupported-kind', message: 'This item cannot be deleted.' };
  const ids = new Set(); const stack = [found.node];
  let folders = 0; let files = 0;
  while (stack.length) { const node = stack.pop(); ids.add(node.id); if (node.kind === 'folder') folders += 1; else files += 1; for (const child of node.children || []) stack.push(child); }
  const originalIndex = found.parent.children.indexOf(found.node);
  const candidateTree = cloneTree(tree);
  const parent = findNodeWithParent(candidateTree, found.parent.id).node;
  parent.children.splice(parent.children.indexOf(findNodeWithParent(candidateTree, targetId).node), 1);
  const currentView = viewBefore || {};
  const viewAfter = {
    ...currentView,
    focusedFolderId: ids.has(currentView.focusedFolderId) ? found.parent.id : currentView.focusedFolderId,
    selectedId: ids.has(currentView.selectedId) ? null : currentView.selectedId,
    detailsTargetId: ids.has(currentView.detailsTargetId) ? found.parent.id : currentView.detailsTargetId
  };
  return { ok: true, noop: false, candidateTree, targetId, parentId: found.parent.id, kind: found.node.kind, index: originalIndex, folders, files, subtreeIds: ids, view: viewAfter, layoutMode: 'recompute', operation: found.node.kind === 'folder' ? 'delete-folder' : 'delete-data', actionLabel: found.node.kind === 'folder' ? 'Delete Folder' : 'Delete Data' };
}







