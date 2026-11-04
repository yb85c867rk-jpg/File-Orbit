import { clientToCanvasCss, hitTestNode } from '../interaction/index.js';

/** Resolve a right-click editor target using final frame hit geometry in CSS px. */
export function diagnoseEditorTarget({ event, canvas, frameState, graph }) {
  if (!event || event.button !== 2) return { ok: false, reason: 'invalid-button' };
  if (!canvas || !frameState || !frameState.hit || !graph) return { ok: false, reason: 'no-coherent-frame' };
  let point;
  try {
    point = clientToCanvasCss(canvas, event.clientX, event.clientY);
  } catch {
    return { ok: false, reason: 'coordinate-conversion-failed' };
  }
  const id = hitTestNode(frameState.hit, point);
  if (!id) return { ok: false, reason: 'hit-miss' };
  const node = graph.nodes.get(id);
  if (!node) return { ok: false, reason: 'stale-target' };
  return { ok: true, target: { id, kind: node.kind, point } };
}

export function resolveEditorTarget(options) {
  const diagnosed = diagnoseEditorTarget(options);
  return diagnosed.ok ? diagnosed.target : null;
}
/** Activation is rejected while another owner or an incoherent frame is active. */
export function editorActivationBlockReason({ editorInert = false, navigatorBusy = false, dragOwned = false, editorSaving = false, frameReady = true, replacementPending = false }) {
  if (replacementPending) return 'replacement-pending';
  if (editorInert) return 'editor-inert';
  if (navigatorBusy) return 'transition-busy';
  if (dragOwned) return 'drag-busy';
  if (editorSaving) return 'editor-saving';
  if (!frameReady) return 'frame-not-ready';
  return null;
}
/** Revalidate a menu target immediately before opening the form. */
export function validateEditorMenuTarget({ target, datasetToken, baseRevision, graph, visibleSet }) {
  if (!target || typeof target.id !== 'string') return { ok: false, reason: 'stale-target' };
  if (target.datasetToken !== datasetToken || target.baseRevision !== baseRevision) {
    return { ok: false, reason: 'stale-identity' };
  }
  const node = graph?.nodes?.get(target.id);
  if (!node || !visibleSet?.has(target.id) || node.kind !== target.hitKind) {
    return { ok: false, reason: 'stale-target' };
  }
  return { ok: true, node };
}


