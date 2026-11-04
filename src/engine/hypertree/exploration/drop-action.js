import { dropRejectionMessage } from './drop-feedback.js';
import { resolveDropTarget } from './reparent.js';

/**
 * Resolve a pointerup destination from the current coherent frame.
 * Hover/cached targets and event.target are deliberately ignored.
 */
export function resolvePointerUpDrop({
  sourceId, event, gesture, generation, datasetToken, structuralRootId,
  frameReady = true, overlay, getDetails, hitAtEvent
}) {
  if (!frameReady) return { ok: false, reason: 'frame-not-ready', dataTarget: false, targetId: null };
  let label = null;
  try { label = overlay?.labelAtPoint?.(event.clientX, event.clientY) || null; } catch { label = null; }
  const details = label ? getDetails(label.id) : null;
  if (label && details?.kind === 'file') {
    const data = resolveDropTarget({ sourceId, hitId: label.id, gesture, generation, datasetToken, structuralRootId });
    return data.ok
      ? { ok: false, reason: 'data-target', dataTarget: true, targetId: label.id }
      : { ...data, dataTarget: false };
  }
  const hit = hitAtEvent?.(event);
  return resolveDropTarget({ sourceId, hitId: hit?.id || null, gesture, generation, datasetToken, structuralRootId });
}

/**
 * Shared pointerup action used by the harness. Data targets and empty/stale
 * outcomes never reach candidate preparation or reparent installation.
 */
export function handlePointerUpDrop({
  sourceId, event, gesture, generation, datasetToken, structuralRootId,
  frameReady = true, overlay, getDetails, hitAtEvent,
  cleanup = () => {}, feedback = () => {}, performReparent = () => ({ ok: false }),
  restore = () => {}, publish = () => {}
}) {
  const resolved = resolvePointerUpDrop({
    sourceId, event, gesture, generation, datasetToken, structuralRootId,
    frameReady, overlay, getDetails, hitAtEvent
  });
  cleanup();
  if (!resolved.ok) {
    feedback(dropRejectionMessage({ reason: resolved.reason, dataTarget: resolved.dataTarget }));
    restore();
    publish();
    return { action: 'rejected', ...resolved };
  }
  const result = performReparent(sourceId, resolved.targetId, gesture);
  if (!result?.ok) feedback(result?.message || dropRejectionMessage({ reason: result?.reason, dataTarget: false }));
  restore();
  publish();
  return { action: 'reparent', ...resolved, result };
}

