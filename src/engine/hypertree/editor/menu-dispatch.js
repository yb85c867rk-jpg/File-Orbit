export function dispatchEditorMenuAction({ action, target, requestDelete, dispatchEditor }) {
  if (action === 'delete-folder' || action === 'delete-data') return requestDelete(target, action);
  return dispatchEditor(target, action);
}
export function validateDeleteIntent({ intent, datasetToken, baseRevision, graph, visibleSet }) {
  if (!intent || intent.kind !== 'delete-request' || !intent.target || typeof intent.target.id !== 'string') return { ok: false, reason: 'invalid-delete-intent' };
  if (intent.datasetToken !== datasetToken || intent.baseRevision !== baseRevision) return { ok: false, reason: 'stale-delete-confirmation' };
  const id = intent.target.id;
  if (id === intent.structuralRootId) return { ok: false, reason: 'root-protected' };
  if (!graph?.nodes?.has(id)) return { ok: false, reason: 'stale-delete-target' };
  if (graph.nodes.get(id).kind !== intent.target.kind) return { ok: false, reason: 'stale-delete-target' };
  if (visibleSet && !visibleSet.has(id)) return { ok: false, reason: 'delete-target-invisible' };
  return { ok: true };
}

