import { GraphRenderError } from '../render/errors.js';

/** Deep-clone a plain synthetic tree without changing metadata references? */
export function cloneTree(root) {
  const clone = (node) => {
    const value = { ...node };
    if (node.data && typeof node.data === 'object') value.data = { ...node.data };
    if (Array.isArray(node.children)) value.children = node.children.map(clone);
    return value;
  };
  return clone(root);
}

export function findTreeNode(root, id) {
  if (!root) return null;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.id === id) return node;
    for (const child of node.children || []) stack.push(child);
  }
  return null;
}

export function collectSubtreeIds(root, id) {
  const node = findTreeNode(root, id);
  if (!node) return new Set();
  const result = new Set();
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    result.add(current.id);
    for (const child of current.children || []) stack.push(child);
  }
  return result;
}

/**
 * Validate and build a candidate tree for a session-local structural move.
 * The input tree is never mutated.
 */
export function buildReparentCandidate({ tree, sourceId, targetId, structuralRootId = tree?.id }) {
  if (!tree || typeof tree !== 'object') throw new GraphRenderError('invalid-reparent', 'tree is required');
  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    return { ok: false, reason: 'stale-id' };
  }
  if (sourceId === structuralRootId) return { ok: false, reason: 'source-root' };
  const source = findTreeNode(tree, sourceId);
  const target = findTreeNode(tree, targetId);
  if (!source || !target) return { ok: false, reason: 'stale-id' };
  if (sourceId === targetId) return { ok: false, reason: 'self' };
  if (target.kind !== 'folder') return { ok: false, reason: 'data-target' };
  const sourceIds = collectSubtreeIds(tree, sourceId);
  if (sourceIds.has(targetId)) return { ok: false, reason: 'descendant-target' };
  const parent = findParent(tree, sourceId);
  if (!parent) return { ok: false, reason: 'stale-id' };
  if (parent.id === targetId) return { ok: false, noop: true, reason: 'existing-parent' };
  const candidateTree = cloneTree(tree);
  const candidateSource = findTreeNode(candidateTree, sourceId);
  const candidateTarget = findTreeNode(candidateTree, targetId);
  const candidateParent = findParent(candidateTree, sourceId);
  if (!candidateSource || !candidateTarget || !candidateParent) return { ok: false, reason: 'stale-id' };
  const index = candidateParent.children.indexOf(candidateSource);
  candidateParent.children.splice(index, 1);
  if (!Array.isArray(candidateTarget.children)) candidateTarget.children = [];
  candidateTarget.children.push(candidateSource);
  return {
    ok: true,
    candidateTree,
    sourceId,
    targetId,
    previousParentId: parent.id,
    structuralRootId,
    subtreeIds: sourceIds
  };
}

export function findParent(root, id) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    for (const child of node.children || []) {
      if (child.id === id) return node;
      stack.push(child);
    }
  }
  return null;
}
/** Authoritative pointerup target; hover state is presentation-only. */
export function resolveDropTarget({ sourceId, hitId, gesture, generation, datasetToken, structuralRootId }) {
  if (!gesture || gesture.sourceId !== sourceId || gesture.generation !== generation
      || gesture.datasetToken !== datasetToken || gesture.structuralRootId !== structuralRootId) {
    return { ok: false, stale: true, reason: 'stale-gesture', targetId: null };
  }
  if (typeof hitId !== 'string' || hitId.length === 0) {
    return { ok: false, stale: false, reason: 'empty', targetId: null };
  }
  return { ok: true, stale: false, reason: null, targetId: hitId };
}
