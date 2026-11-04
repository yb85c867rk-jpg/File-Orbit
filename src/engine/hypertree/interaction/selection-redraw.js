import { GraphRenderError } from '../render/errors.js';

/**
 * Shared selection-redraw boundary.
 *
 * On a drawing/label failure, invalidate the installed hit snapshot before
 * returning. Cleanup callbacks let the caller suppress reentrant selection
 * callbacks while the controller is invalidated. The original error is returned.
 */
export function redrawSelectionFrame(input) {
  if (!input || typeof input.draw !== 'function') {
    throw new GraphRenderError('invalid-selection', 'selection draw callback is required');
  }
  if (!input.controller || typeof input.controller.invalidate !== 'function') {
    throw new GraphRenderError('invalid-selection', 'selection controller is required');
  }
  try {
    const result = input.draw();
    if (result && typeof result.then === 'function') {
      throw new GraphRenderError('async-frame-unsupported', 'selection redraw must be synchronous');
    }
    return { ok: true, result };
  } catch (error) {
    try {
      input.onCleanupStart?.();
      try {
        input.controller.invalidate();
      } catch {
        // Preserve the original drawing/label failure.
      }
      return { ok: false, error };
    } finally {
      try {
        input.onCleanupEnd?.();
      } catch {
        // Cleanup callbacks cannot replace the original failure.
      }
    }
  }
}
