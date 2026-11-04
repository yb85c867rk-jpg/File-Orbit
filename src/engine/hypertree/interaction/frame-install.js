import { GraphRenderError } from '../render/errors.js';

/**
 * Invalidate interaction, draw/update the complete replacement, and install its
 * hit snapshot only after that work succeeds. Any failure leaves interaction
 * invalidated; it never installs geometry for an unconfirmed frame.
 *
 * @param {object} controller createSelectionController instance
 * @param {{scene:object, generation?:number, selectedId?:string|null, draw:(scene:object)=>any}} input
 */
export function installSelectionFrame(controller, input) {
  if (!controller || typeof controller.invalidate !== 'function' || typeof controller.update !== 'function') {
    throw new GraphRenderError('invalid-controller', 'selection controller is required');
  }
  if (!input || typeof input.draw !== 'function') {
    throw new GraphRenderError('invalid-frame', 'draw callback is required');
  }
  controller.invalidate();
  try {
    const drawResult = input.draw(input.scene);
    controller.update({
      scene: input.scene,
      generation: input.generation
    });
    if (input.selectedId !== undefined) {
      controller.restoreSelection(input.selectedId === null ? null : input.selectedId);
    }
    return { drawResult, state: controller.getState() };
  } catch (error) {
    // Leave no stale/unconfirmed hit targets installed.
    try {
      controller.invalidate();
    } catch {
      // Preserve the original preparation/drawing/update failure.
    }
    throw error;
  }
}

