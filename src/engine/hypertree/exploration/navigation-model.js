import { createFocusView } from '../focus/index.js';
import { GraphRenderError } from '../render/errors.js';

/** Structural parent map from the authoritative base layout. */
export function parentMap(baseLayout) {
  const parentById = new Map();
  for (const [parentId, children] of baseLayout.children) {
    for (const childId of children) parentById.set(childId, parentId);
  }
  return parentById;
}

/**
 * focused folder F:
 * visible = { nodes whose original structural depth <= depth(F) } U descendants(F)
 */
export function deriveSubtreeView({ graph, baseLayout, focusedFolderId, structuralRootId = baseLayout?.rootId, phase = baseLayout?.firstPhase }) {
  if (!graph || !(graph.nodes instanceof Map)) throw new GraphRenderError('invalid-exploration', 'graph is required');
  if (!baseLayout || !(baseLayout.nodes instanceof Map) || !(baseLayout.children instanceof Map)) {
    throw new GraphRenderError('invalid-exploration', 'base layout is required');
  }
  if (typeof structuralRootId !== 'string' || !baseLayout.nodes.has(structuralRootId)) {
    throw new GraphRenderError('invalid-exploration', 'unknown structural root');
  }
  if (typeof focusedFolderId !== 'string' || !baseLayout.nodes.has(focusedFolderId)) {
    throw new GraphRenderError('invalid-exploration', 'unknown focused folder');
  }
  if (!baseLayout.phases.includes(phase)) throw new GraphRenderError('invalid-phase', 'unsupported exploration phase');
  const parents = parentMap(baseLayout);
  const ancestorIds = [];
  let cursor = focusedFolderId;
  const seen = new Set();
  while (cursor !== undefined) {
    if (seen.has(cursor)) throw new GraphRenderError('invalid-exploration', 'structural cycle');
    seen.add(cursor);
    ancestorIds.push(cursor);
    if (cursor === structuralRootId) break;
    cursor = parents.get(cursor);
  }
  if (ancestorIds[ancestorIds.length - 1] !== structuralRootId) {
    throw new GraphRenderError('invalid-exploration', 'focused folder is outside structural root');
  }
  ancestorIds.reverse();
  const descendantIds = [];
  const stack = [focusedFolderId];
  while (stack.length > 0) {
    const id = stack.pop();
    descendantIds.push(id);
    const children = baseLayout.children.get(id) || [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  const focusedStructuralDepth = baseLayout.depths.get(focusedFolderId);
  if (!Number.isInteger(focusedStructuralDepth) || focusedStructuralDepth < 0) {
    throw new GraphRenderError('invalid-exploration', 'focused folder has no authoritative structural depth');
  }
  // All nodes at or above F's original structural depth, independent of parent.
  const contextIds = [...baseLayout.nodes.keys()].filter((id) => baseLayout.depths.get(id) <= focusedStructuralDepth);
  const contextSet = new Set(contextIds);
  const subtreeSet = new Set(descendantIds);
  const visibleSet = new Set([...contextIds, ...descendantIds]);
  // Preserve authoritative node order and include each ID once.
  const visibleIds = [...baseLayout.nodes.keys()].filter((id) => visibleSet.has(id));
  const visibleEdges = [];
  for (const [parentId, children] of baseLayout.children) {
    if (!visibleSet.has(parentId)) continue;
    for (const childId of children) {
      if (!visibleSet.has(childId)) continue;
      visibleEdges.push([parentId, childId]);
    }
  }
  let contextOverlapCount = 0;
  for (const id of contextSet) if (subtreeSet.has(id)) contextOverlapCount += 1;
  return {
    structuralRootId,
    focusedFolderId,
    focusedStructuralDepth,
    phase,
    ancestorIds,
    descendantIds,
    contextIds,
    contextSet,
    subtreeSet,
    contextCount: contextIds.length,
    subtreeCount: descendantIds.length,
    contextOverlapCount,
    visibleIds,
    visibleSet,
    visibleEdges,
    visibleEdgeCount: visibleEdges.length,
    hiddenCount: baseLayout.nodes.size - visibleIds.length,
    breadcrumbIds: ancestorIds
  };
}

/** Filter a focused copy. Root styling remains the original structural root. */
export function buildFilteredViewLayout({ baseLayout, view, focusedStaged = null }) {
  const focused = focusedStaged || createFocusView(baseLayout, { focusId: view.focusedFolderId, phase: view.phase }).staged;
  const nodes = new Map([...focused.nodes].filter(([id]) => view.visibleSet.has(id)));
  const children = new Map();
  for (const [id, ids] of focused.children) {
    if (!view.visibleSet.has(id)) continue;
    children.set(id, ids.filter((childId) => view.visibleSet.has(childId)));
  }
  return {
    ...focused,
    rootId: view.structuralRootId,
    displayRootId: view.focusedFolderId,
    structuralRootId: view.structuralRootId,
    focusedFolderId: view.focusedFolderId,
    ancestorIds: view.ancestorIds,
    nodes,
    children,
    nodeCount: nodes.size,
    depths: new Map([...focused.depths].filter(([id]) => view.visibleSet.has(id))),
    demandById: new Map([...focused.demandById].filter(([id]) => view.visibleSet.has(id))),
    allocatedSpanById: new Map([...focused.allocatedSpanById].filter(([id]) => view.visibleSet.has(id))),
    radialById: new Map([...focused.radialById].filter(([id]) => view.visibleSet.has(id))),
    parentRadialById: new Map([...focused.parentRadialById].filter(([id]) => view.visibleSet.has(id))),
    placementRadiiById: new Map([...focused.placementRadiiById].filter(([id]) => view.visibleSet.has(id))),
    scales: new Map([...focused.scales].filter(([id]) => view.visibleSet.has(id)))
  };
}

/** Node-only navigation state. No history, Back, Overview, or breadcrumb actions. */
export function createExplorationModel({ graph, baseLayout, structuralRootId = baseLayout?.rootId, phase = baseLayout?.firstPhase }) {
  let focusedFolderId = structuralRootId;
  let selectedId = null;
  const model = {
    get structuralRootId() { return structuralRootId; },
    get focusedFolderId() { return focusedFolderId; },
    get focusedStructuralDepth() { return baseLayout.depths.get(focusedFolderId); },
    get selectedId() { return selectedId; },
    view() { return deriveSubtreeView({ graph, baseLayout, focusedFolderId, structuralRootId, phase }); },
    details(id = selectedId) {
      const view = model.view();
      if (typeof id !== 'string' || !view.visibleSet.has(id)) return null;
      const node = graph.nodes.get(id);
      if (!node) return null;
      const children = baseLayout.children.get(id) || [];
      const parents = parentMap(baseLayout);
      const path = [];
      let cursor = id;
      while (cursor !== undefined) { path.push(cursor); cursor = parents.get(cursor); }
      path.reverse();
      return {
        id,
        name: node.name,
        kind: node.kind,
        directChildCount: children.length,
        descendantCount: countDescendants(id, baseLayout) - 1,
        displayPath: path.map((nodeId) => graph.nodes.get(nodeId)?.name || nodeId).join(' / '),
        pathKind: 'display-breadcrumb',
        parentId: path.length > 1 ? path[path.length - 2] : null,
        isFolder: node.kind === 'folder',
        isRoot: id === structuralRootId,
        description: typeof node.data?.description === 'string' ? node.data.description : null,
        dataType: node.data?.dataType === 'file' || node.data?.dataType === 'web-link' ? node.data.dataType : 'legacy',
        link: typeof node.data?.link === 'string' ? node.data.link : null,
        attachment: typeof node.data?.attachmentId === 'string' ? {
          attachmentId: node.data.attachmentId,
          originalName: node.data.originalName ?? null,
          sizeBytes: node.data.sizeBytes ?? null,
          mime: node.data.mime ?? null,
          classification: node.data.classification ?? null
        } : null
      };
    },
    select(id) {
      const view = model.view();
      if (typeof id !== 'string' || !view.visibleSet.has(id)) return { ok: false, reason: 'not-visible' };
      selectedId = id;
      return { ok: true, selectedId, view };
    },
    restoreSelection(id) {
      const view = model.view();
      if (id === null) { selectedId = null; return { ok: true, selectedId: null, navigated: false }; }
      if (typeof id !== 'string' || !view.visibleSet.has(id)) return { ok: false, reason: 'not-visible', navigated: false };
      selectedId = id;
      return { ok: true, selectedId, navigated: false };
    },
    clearSelection() { selectedId = null; },
    enterFolder(id) {
      const view = model.view();
      if (typeof id !== 'string' || !view.visibleSet.has(id)) return { ok: false, reason: 'not-visible', changed: false };
      const node = graph.nodes.get(id);
      if (!node || node.kind !== 'folder') return { ok: false, reason: 'not-folder', changed: false };
      selectedId = id;
      if (id === focusedFolderId) return { ok: true, changed: false, view: model.view(), selectedId };
      focusedFolderId = id;
      return { ok: true, changed: true, view: model.view(), selectedId };
    },
    snapshot() { return { focusedFolderId, selectedId }; },
    restore(snapshot) {
      if (!snapshot || typeof snapshot.focusedFolderId !== 'string' || !baseLayout.nodes.has(snapshot.focusedFolderId)) return { ok: false };
      focusedFolderId = snapshot.focusedFolderId;
      const view = model.view();
      selectedId = snapshot.selectedId !== null && view.visibleSet.has(snapshot.selectedId) ? snapshot.selectedId : null;
      return { ok: true, view, selectedId };
    }
  };
  return model;
}

function countDescendants(id, baseLayout) {
  let count = 0;
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    count += 1;
    for (const child of baseLayout.children.get(current) || []) stack.push(child);
  }
  return count;
}










