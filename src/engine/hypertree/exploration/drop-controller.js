import { handlePointerUpDrop } from './drop-action.js';

/**
 * Build the drag-controller pointerup callback from live harness state.
 * The gesture object is captured before cleanup so generation/dataset/root
 * validation still sees the accepted gesture.
 */
export function createPointerUpDropHandler({
  getGesture,
  getDragIdentity,
  overlay,
  getDetails,
  hitAtEvent,
  cleanup,
  feedback,
  performReparent,
  restore,
  publish
}) {
  if (typeof getGesture !== 'function') throw new Error('getGesture is required');
  if (typeof getDragIdentity !== 'function') throw new Error('getDragIdentity is required');
  return ({ id, event }) => {
    const gesture = getGesture();
    const identity = getDragIdentity() || {};
    return handlePointerUpDrop({
      sourceId: id,
      event,
      gesture,
      generation: identity.generation,
      datasetToken: identity.datasetToken,
      structuralRootId: identity.structuralRootId,
      frameReady: Boolean(identity.frameReady),
      overlay,
      getDetails,
      hitAtEvent,
      cleanup,
      feedback,
      performReparent,
      restore,
      publish
    });
  };
}
