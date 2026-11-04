import { GraphRenderError } from '../render/errors.js';

/**
 * Shared label priority list for exploration normal and transition frames.
 * Order: focused folder, parent, structural root, remaining ancestors, selected.
 */
export function explorationLabelPriorityIds({ view, structuralRootId, selectedId = null }) {
  if (!view || !Array.isArray(view.ancestorIds) || typeof structuralRootId !== 'string') {
    throw new GraphRenderError('invalid-label-priority', 'exploration view and structural root are required');
  }
  const parent = view.ancestorIds.length > 1 ? view.ancestorIds[view.ancestorIds.length - 2] : null;
  return [...new Set([
    view.focusedFolderId,
    parent,
    structuralRootId,
    ...view.ancestorIds.slice().reverse(),
    selectedId
  ].filter(Boolean))];
}

/**
 * Stable direct-child label priorities for the folder being inspected.
 * Children are returned in tree order and filtered to the current visible set.
 */
export function folderContextLabelPriorityIds({ tree, view, folderId }) {
  if (!tree || typeof folderId !== 'string' || !view || !(view.visibleSet instanceof Set)) return [];
  let folder = null;
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.id !== 'string') continue;
    if (node.id === folderId) { folder = node; break; }
    if (Array.isArray(node.children)) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
    }
  }
  if (!folder || !Array.isArray(folder.children)) return [];
  return folder.children
    .map((child) => child && child.id)
    .filter((id) => typeof id === 'string' && view.visibleSet.has(id));
}
