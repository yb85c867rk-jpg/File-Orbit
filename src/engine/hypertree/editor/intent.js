/** Semantic pending selection intent; never stores pointer coordinates. */
export function createSelectionIntent({ kind, targetId = null, hitKind = null, openAttachment = false, datasetToken, baseRevision }) {
  if (kind !== 'background-clear' && kind !== 'folder-enter' && kind !== 'node-select') {
    return null;
  }
  return { kind, targetId, hitKind, openAttachment: openAttachment === true, datasetToken, baseRevision, source: 'canvas-click' };
}

export function validateSelectionIntent({ intent, datasetToken, baseRevision, graph, visibleSet }) {
  if (!intent) return { ok: false, reason: 'missing-intent' };
  if (intent.datasetToken !== datasetToken || intent.baseRevision !== baseRevision) {
    return { ok: false, reason: 'stale-intent' };
  }
  if (intent.kind === 'background-clear') return { ok: true, intent };
  if (typeof intent.targetId !== 'string') return { ok: false, reason: 'stale-intent' };
  const node = graph.nodes.get(intent.targetId);
  if (!node || !visibleSet.has(intent.targetId) || node.kind !== intent.hitKind) {
    return { ok: false, reason: 'stale-intent' };
  }
  return { ok: true, intent, node };
}

