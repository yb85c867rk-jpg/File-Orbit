import { cloneTree, findTreeNode } from '../exploration/reparent.js';
import { findNodeWithParent, validateEditorAdmission } from './validation.js';
import { collectSubtreeIds } from '../exploration/reparent.js';

function jsonClone(value) { return value === undefined ? null : JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function metadata(node) {
  return { name: node.name, data: jsonClone(node.data || {}) };
}
export function makeMetadataHistoryEntry({ action, tree, candidateTree, targetId, viewBefore, viewAfter, datasetToken }) {
  const before = findTreeNode(tree, targetId);
  const after = findTreeNode(candidateTree, targetId);
  if (!before || !after) return null;
  const attachmentRefs = [...new Set([before.data?.attachmentId, after.data?.attachmentId].filter((id) => typeof id === 'string'))];
  return {
    kind: 'metadata-edit', action, targetId, hitKind: before.kind, datasetToken, structuralRootId: tree.id,
    before: metadata(before), after: metadata(after),
    viewBefore: jsonClone(viewBefore), viewAfter: jsonClone(viewAfter),
    attachmentRefs
  };
}
export function buildMetadataReplayCommand({ tree, entry, direction, datasetToken, structuralRootId, policyContext = undefined, maxNodes = undefined }) {
  if (!entry || entry.kind !== 'metadata-edit') return { ok: false, reason: 'history-invalid', message: 'History entry is invalid.' };
  if (entry.datasetToken !== datasetToken) return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Undo/Redo was rejected.' };
  if (structuralRootId && entry.structuralRootId && entry.structuralRootId !== structuralRootId) return { ok: false, reason: 'stale-structural-root', message: 'The structural root changed. Undo/Redo was rejected.' };
  if (structuralRootId && tree.id !== structuralRootId) return { ok: false, reason: 'stale-structural-root', message: 'The structural root changed. Undo/Redo was rejected.' };
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const found = findNodeWithParent(tree, entry.targetId);
  if (!found || found.node.kind !== entry.hitKind) return { ok: false, reason: 'stale-target', message: 'The edited node no longer exists.' };
  const expected = direction === 'undo' ? entry.after : entry.before;
  const next = direction === 'undo' ? entry.before : entry.after;
  const rootTarget = entry.targetId === tree.id;
  const expectedComparable = rootTarget ? { name: found.node.name, data: expected.data } : expected;
  if (stable(metadata(found.node)) !== stable(expectedComparable)) return { ok: false, reason: 'expected-state-mismatch', message: 'The node changed since this history entry. Undo/Redo was rejected.' };
  const candidateTree = cloneTree(tree);
  const node = findTreeNode(candidateTree, entry.targetId);
  node.name = rootTarget ? tree.name : next.name;
  node.data = jsonClone(next.data);
  if (rootTarget && stable(metadata(node)) === stable(metadata(found.node))) {
    return { ok: true, noop: true, reason: 'superseded-root-title', candidateTree, targetId: entry.targetId, operation: direction === 'undo' ? 'undo-metadata' : 'redo-metadata', actionLabel: entry.action, direction, message: 'This history entry only changes the superseded root title.' };
  }
  return {
    ok: true, noop: false, candidateTree, targetId: entry.targetId,
    layoutMode: 'preserve', operation: direction === 'undo' ? 'undo-metadata' : 'redo-metadata',
    view: direction === 'undo' ? entry.viewBefore : entry.viewAfter,
    actionLabel: entry.action, direction
  };
}
function collectAttachmentIds(node) {
  const ids = new Set();
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current.data?.attachmentId === 'string') ids.add(current.data.attachmentId);
    for (const child of current.children || []) stack.push(child);
  }
  return [...ids];
}
export function makeAddHistoryEntry({ action, tree, candidateTree, parentId, nodeId, viewBefore, viewAfter, datasetToken }) {
  const parent = findTreeNode(candidateTree, parentId);
  const node = findTreeNode(candidateTree, nodeId);
  if (!parent || !node) return null;
  return {
    kind: 'structural-add', action, datasetToken, parentId, nodeId,
    index: parent.children.indexOf(node), node: jsonClone(node),
    viewBefore: jsonClone(viewBefore), viewAfter: jsonClone(viewAfter),
    attachmentRefs: collectAttachmentIds(node)
  };
}
export function makeUploadHistoryEntry({ action, tree, candidateTree, parentId, addedRootIds = [], viewBefore, viewAfter, datasetToken }) {
  const parent = findTreeNode(candidateTree, parentId);
  if (!parent || parent.kind !== 'folder') return null;
  const nodes = [];
  for (const id of addedRootIds) {
    const node = findTreeNode(candidateTree, id);
    if (!node) return null;
    const index = parent.children.findIndex((child) => child.id === id);
    if (index < 0) return null;
    nodes.push({ id, index, node: jsonClone(node) });
  }
  const attachmentRefs = [...new Set(nodes.flatMap((entry) => collectAttachmentIds(entry.node)))];
  return {
    kind: 'structural-add-many', action, datasetToken, parentId, nodes,
    viewBefore: jsonClone(viewBefore), viewAfter: jsonClone(viewAfter), attachmentRefs
  };
}

export function makeReparentHistoryEntry({ tree, candidateTree, sourceId, structuralRootId, datasetToken, viewBefore, viewAfter }) {
  const beforeParent = findNodeWithParent(tree, sourceId);
  const afterParent = findNodeWithParent(candidateTree, sourceId);
  if (!beforeParent || !afterParent || !beforeParent.parent || !afterParent.parent) return null;
  const beforeIndex = beforeParent.parent.children.indexOf(beforeParent.node);
  const afterIndex = afterParent.parent.children.indexOf(afterParent.node);
  return {
    kind: 'structural-reparent', action: 'Move', datasetToken, sourceId, structuralRootId,
    fromParentId: beforeParent.parent.id, fromIndex: beforeIndex,
    toParentId: afterParent.parent.id, toIndex: afterIndex,
    node: jsonClone(beforeParent.node),
    viewBefore: jsonClone(viewBefore), viewAfter: jsonClone(viewAfter),
    attachmentRefs: collectAttachmentIds(beforeParent.node)
  };
}
export function buildStructuralReplayCommand({ tree, entry, direction, datasetToken, structuralRootId, policyContext = undefined, maxNodes = undefined }) {
  if (!entry || (entry.kind !== 'structural-add' && entry.kind !== 'structural-add-many' && entry.kind !== 'structural-reparent')) return { ok: false, reason: 'history-invalid', message: 'History entry is invalid.' };
  if (entry.datasetToken !== datasetToken) return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Undo/Redo was rejected.' };
  if (structuralRootId && entry.structuralRootId && entry.structuralRootId !== structuralRootId) return { ok: false, reason: 'stale-structural-root', message: 'The structural root changed. Undo/Redo was rejected.' };
  if (structuralRootId && tree.id !== structuralRootId) return { ok: false, reason: 'stale-structural-root', message: 'The structural root changed. Undo/Redo was rejected.' };
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const view = direction === 'undo' ? entry.viewBefore : entry.viewAfter;
  if (entry.kind === 'structural-add-many') {
    const parent = findTreeNode(tree, entry.parentId);
    if (!parent || parent.kind !== 'folder') return { ok: false, reason: 'stale-parent', message: 'The destination folder no longer exists.' };
    const view = direction === 'undo' ? entry.viewBefore : entry.viewAfter;
    if (direction === 'undo') {
      for (const recorded of entry.nodes) {
        const located = findNodeWithParent(tree, recorded.id);
        if (!located || located.parent.id !== entry.parentId || stable(located.node) !== stable(recorded.node)) {
          return { ok: false, reason: 'expected-state-mismatch', message: 'An uploaded node changed since this history entry. Undo was rejected.' };
        }
      }
      const candidateTree = cloneTree(tree);
      for (const recorded of entry.nodes) {
        const located = findNodeWithParent(candidateTree, recorded.id);
        if (located) located.parent.children.splice(located.parent.children.indexOf(located.node), 1);
      }
      const admittedUndo = validateEditorAdmission(candidateTree, { policyContext, maxNodes });
      if (!admittedUndo.ok) return admittedUndo;
      return { ok: true, candidateTree, targetId: entry.parentId, layoutMode: 'recompute', operation: 'undo-upload', view, actionLabel: entry.action };
    }
    let insertedCount = 0;
    for (const recorded of entry.nodes) {
      if (findTreeNode(tree, recorded.id)) return { ok: false, reason: 'id-collision', message: 'A recorded upload ID already exists. Redo was rejected.' };
      for (const id of collectSubtreeIds(recorded.node, recorded.id)) if (findTreeNode(tree, id)) return { ok: false, reason: 'id-collision', message: 'A recorded upload subtree ID already exists. Redo was rejected.' };
      if (!Number.isSafeInteger(recorded.index) || recorded.index < 0 || recorded.index > parent.children.length + insertedCount) return { ok: false, reason: 'invalid-index', message: 'The recorded sibling position is invalid. Redo was rejected.' };
      insertedCount += 1;
    }
    const candidateTree = cloneTree(tree);
    const targetParent = findTreeNode(candidateTree, entry.parentId);
    for (const recorded of [...entry.nodes].sort((left, right) => left.index - right.index)) {
      targetParent.children.splice(recorded.index, 0, jsonClone(recorded.node));
    }
    const admittedRedo = validateEditorAdmission(candidateTree, { policyContext, maxNodes });
    if (!admittedRedo.ok) return admittedRedo;
    return { ok: true, candidateTree, targetId: entry.parentId, layoutMode: 'recompute', operation: 'redo-upload', view, actionLabel: entry.action };
  }
  if (entry.kind === 'structural-add') {
    const parent = findTreeNode(tree, entry.parentId);
    if (!parent || parent.kind !== 'folder') return { ok: false, reason: 'stale-parent', message: 'The destination folder no longer exists.' };
    const existing = findTreeNode(tree, entry.nodeId);
    if (direction === 'undo') {
      if (!existing || parent.children[entry.index] !== existing || stable(existing) !== stable(entry.node)) {
        return { ok: false, reason: 'expected-state-mismatch', message: 'The added node changed since this history entry. Undo was rejected.' };
      }
      const candidateTree = cloneTree(tree);
      const targetParent = findTreeNode(candidateTree, entry.parentId);
      targetParent.children.splice(entry.index, 1);
      const admittedUndo = validateEditorAdmission(candidateTree, { policyContext, maxNodes });
      if (!admittedUndo.ok) return admittedUndo;
      return { ok: true, candidateTree, targetId: entry.parentId, layoutMode: 'recompute', operation: 'undo-add', view, actionLabel: entry.action };
    }
    if (existing) return { ok: false, reason: 'id-collision', message: 'The recorded node ID already exists. Redo was rejected.' };
    for (const id of collectSubtreeIds(entry.node, entry.node.id)) if (findTreeNode(tree, id)) return { ok: false, reason: 'id-collision', message: 'A recorded subtree ID already exists. Redo was rejected.' };
    if (!Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index > parent.children.length) return { ok: false, reason: 'invalid-index', message: 'The recorded sibling position is invalid. Redo was rejected.' };
    const candidateTree = cloneTree(tree);
    const targetParent = findTreeNode(candidateTree, entry.parentId);
    targetParent.children.splice(entry.index, 0, jsonClone(entry.node));
    const admittedRedo = validateEditorAdmission(candidateTree, { policyContext, maxNodes });
    if (!admittedRedo.ok) return admittedRedo;
    return { ok: true, candidateTree, targetId: entry.nodeId, layoutMode: 'recompute', operation: 'redo-add', view, actionLabel: entry.action };
  }
  const found = findNodeWithParent(tree, entry.sourceId);
  if (!found || !found.parent) return { ok: false, reason: 'stale-target', message: 'The moved node no longer exists.' };
  const expectedParent = direction === 'undo' ? entry.toParentId : entry.fromParentId;
  const expectedIndex = direction === 'undo' ? entry.toIndex : entry.fromIndex;
  const nextParent = direction === 'undo' ? entry.fromParentId : entry.toParentId;
  const nextIndex = direction === 'undo' ? entry.fromIndex : entry.toIndex;
  if (found.parent.id !== expectedParent || found.parent.children.indexOf(found.node) !== expectedIndex || stable(found.node) !== stable(entry.node)) {
    return { ok: false, reason: 'expected-state-mismatch', message: 'The moved subtree changed since this history entry. Undo/Redo was rejected.' };
  }
  const target = findTreeNode(tree, nextParent);
  if (!target || target.kind !== 'folder') return { ok: false, reason: 'stale-parent', message: 'The destination folder no longer exists.' };
  if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex > target.children.length) return { ok: false, reason: 'invalid-index', message: 'The recorded sibling position is invalid. Undo/Redo was rejected.' };
  if (entry.sourceId === structuralRootId) return { ok: false, reason: 'source-root', message: 'The structural root cannot be moved.' };
  if (nextParent === entry.sourceId || collectAttachmentIds(found.node).length >= 0 && findTreeNode(found.node, nextParent)) {
    return { ok: false, reason: 'cycle-target', message: 'A folder cannot be moved into its own subtree.' };
  }
  const candidateTree = cloneTree(tree);
  const source = findNodeWithParent(candidateTree, entry.sourceId);
  const destination = findTreeNode(candidateTree, nextParent);
  source.parent.children.splice(source.parent.children.indexOf(source.node), 1);
  destination.children.splice(nextIndex, 0, source.node);
  const admittedMove = validateEditorAdmission(candidateTree, { policyContext, maxNodes });
  if (!admittedMove.ok) return admittedMove;
  return { ok: true, candidateTree, targetId: entry.sourceId, layoutMode: 'recompute', operation: direction === 'undo' ? 'undo-move' : 'redo-move', view, actionLabel: entry.action };
}
export function makeDeleteHistoryEntry({ action, tree, candidateTree, targetId, structuralRootId, datasetToken, viewBefore, viewAfter }) {
  const parent = findNodeWithParent(tree, targetId);
  if (!parent || !parent.parent) return null;
  const node = parent.node;
  return {
    kind: 'structural-delete', action, datasetToken, structuralRootId, targetId, kindOfTarget: node.kind,
    parentId: parent.parent.id, index: parent.parent.children.indexOf(node),
    node: jsonClone(node), viewBefore: jsonClone(viewBefore), viewAfter: jsonClone(viewAfter),
    attachmentRefs: collectAttachmentIds(node)
  };
}
export function buildDeleteReplayCommand({ tree, entry, direction, datasetToken, structuralRootId, policyContext = undefined, maxNodes = undefined }) {
  if (!entry || entry.kind !== 'structural-delete') return { ok: false, reason: 'history-invalid', message: 'History entry is invalid.' };
  if (entry.datasetToken !== datasetToken) return { ok: false, reason: 'stale-dataset', message: 'The dataset changed. Undo/Redo was rejected.' };
  if (structuralRootId && entry.structuralRootId && entry.structuralRootId !== structuralRootId) return { ok: false, reason: 'stale-structural-root', message: 'The structural root changed. Undo/Redo was rejected.' };
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes }); if (!admission.ok) return admission;
  const parent = findTreeNode(tree, entry.parentId);
  if (!parent || parent.kind !== 'folder') return { ok: false, reason: 'stale-parent', message: 'The original parent folder no longer exists.' };
  const existing = findTreeNode(tree, entry.targetId);
  const view = direction === 'undo' ? entry.viewBefore : entry.viewAfter;
  if (direction === 'undo') {
    if (existing) return { ok: false, reason: 'id-collision', message: 'The deleted node ID already exists. Undo was rejected.' };
    for (const id of collectSubtreeIds(entry.node, entry.node.id)) if (findTreeNode(tree, id)) return { ok: false, reason: 'id-collision', message: 'A recorded subtree ID already exists. Undo was rejected.' };
    if (!Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index > parent.children.length) return { ok: false, reason: 'invalid-index', message: 'The recorded sibling position is invalid. Undo was rejected.' };
    const candidateTree = cloneTree(tree);
    findTreeNode(candidateTree, entry.parentId).children.splice(entry.index, 0, jsonClone(entry.node));
    const admitted = validateEditorAdmission(candidateTree, { policyContext, maxNodes }); if (!admitted.ok) return admitted;
    return { ok: true, candidateTree, targetId: entry.targetId, layoutMode: 'recompute', operation: 'undo-delete', view, actionLabel: entry.action };
  }
  if (!existing || parent.children[entry.index] !== existing || stable(existing) !== stable(entry.node)) return { ok: false, reason: 'expected-state-mismatch', message: 'The deleted subtree changed. Redo was rejected.' };
  const candidateTree = cloneTree(tree);
  findTreeNode(candidateTree, entry.parentId).children.splice(entry.index, 1);
  const admitted = validateEditorAdmission(candidateTree, { policyContext, maxNodes }); if (!admitted.ok) return admitted;
  return { ok: true, candidateTree, targetId: entry.parentId, layoutMode: 'recompute', operation: 'redo-delete', view, actionLabel: entry.action };
}



