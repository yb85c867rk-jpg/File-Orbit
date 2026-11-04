import { GraphRenderError } from '../render/errors.js';
import { createHitSnapshot, hitTestNode, snapshotContainsHittableId } from './hit-test.js';
import { clientToCanvasCss } from './pointer.js';

/**
 * Mouse-only selection controller. It owns one click listener on the supplied
 * canvas; no document/window listeners, timers, observers, or animation loops.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{onChange?: (event:object)=>void}} [options]
 */
export function createSelectionController(canvas, options = {}) {
  if (!canvas || typeof canvas.addEventListener !== 'function'
      || typeof canvas.removeEventListener !== 'function') {
    throw new GraphRenderError('invalid-canvas', 'canvas with add/removeEventListener is required');
  }
  const onChange = options.onChange;
  if (onChange !== undefined && typeof onChange !== 'function') {
    throw new GraphRenderError('invalid-controller', 'onChange must be a function when provided');
  }
  return new SelectionController(canvas, onChange || null);
}

class SelectionController {
  #canvas;
  #onChange;
  #snapshot = null;
  #frame = null;
  #selectedId = null;
  #generation = 0;
  #lastCallbackError = null;
  #destroyed = false;
  #click = (event) => this.#handleClick(event);

  constructor(canvas, onChange) {
    this.#canvas = canvas;
    this.#onChange = onChange;
    canvas.addEventListener('click', this.#click);
  }

  getState() {
    this.#assertAlive();
    return Object.freeze({
      selectedId: this.#selectedId,
      generation: this.#frame ? this.#frame.generation : null,
      phase: this.#frame ? this.#frame.phase : null,
      viewport: this.#frame ? Object.freeze({ ...this.#frame.viewport }) : null,
      nodeCount: this.#snapshot ? this.#snapshot.nodes.length : 0,
      lastCallbackError: this.#lastCallbackError
    });
  }

  /**
   * Install a validated snapshot and frame. Invalid input leaves the previous
   * installed snapshot/selection intact. The caller must update after drawing
   * the matching frame; use invalidate() before a resize/scene replacement gap.
   */
  update(input) {
    this.#assertAlive();
    if (!input || typeof input !== 'object') {
      throw new GraphRenderError('invalid-hit-scene', 'update input is required');
    }
    const nextSnapshot = createHitSnapshot(input.scene);
    const nextFrame = normalizeFrame(input, this.#generation);
    const nextSelected = this.#frame && this.#frame.viewport.width === 0
      ? null
      : this.#selectedId;
    const stillHittable = nextSelected === null
      ? false
      : snapshotContainsHittableId(nextSnapshot, nextSelected);
    const selection = nextFrame.viewport.width > 0 && nextFrame.viewport.height > 0 && stillHittable
      ? nextSelected
      : null;

    this.#snapshot = nextSnapshot;
    this.#frame = nextFrame;
    this.#generation = nextFrame.generation;
    const previous = this.#selectedId;
    this.#selectedId = selection;
    if (selection !== previous) this.#notify(previous, selection, 'update');
    return this.getState();
  }

  clear() {
    this.#assertAlive();
    const previous = this.#selectedId;
    this.#selectedId = null;
    if (previous !== null) this.#notify(previous, null, 'clear');
    return this.getState();
  }
  /**
   * Explicit selection restoration for a successfully installed replacement.
   * Does not synthesize a click. Non-hittable IDs clear the selection.
   */
  restoreSelection(id) {
    this.#assertAlive();
    if (id !== null && typeof id !== 'string') {
      throw new GraphRenderError('invalid-selection', 'restored selection must be a string or null');
    }
    if (id !== null && !this.#snapshot) {
      throw new GraphRenderError('invalid-frame', 'cannot restore selection without an installed frame');
    }
    const selected = id !== null && snapshotContainsHittableId(this.#snapshot, id) ? id : null;
    const previous = this.#selectedId;
    this.#selectedId = selected;
    if (selected !== previous) this.#notify(previous, selected, 'restore');
    return this.getState();
  }

  /** Drop the installed snapshot/selection without removing the listener. */
  invalidate() {
    this.#assertAlive();
    const previous = this.#selectedId;
    this.#selectedId = null;
    this.#snapshot = null;
    this.#frame = null;
    if (previous !== null) this.#notify(previous, null, 'invalidate');
    return this.getState();
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#canvas.removeEventListener('click', this.#click);
    this.#snapshot = null;
    this.#frame = null;
    this.#selectedId = null;
    this.#canvas = null;
    this.#onChange = null;
  }

  #handleClick(event) {
    if (!this.#snapshot || !this.#frame || !event || event.button !== 0) return;
    if (this.#frame.viewport.width <= 0 || this.#frame.viewport.height <= 0) return;
    let point;
    try {
      point = clientToCanvasCss(this.#canvas, event.clientX, event.clientY);
    } catch {
      return;
    }
    if (point.x < 0 || point.y < 0
        || point.x >= this.#frame.viewport.width || point.y >= this.#frame.viewport.height) {
      return;
    }
    const selectedId = hitTestNode(this.#snapshot, point);
    const previous = this.#selectedId;
    if (selectedId === previous) return;
    this.#selectedId = selectedId;
    this.#notify(previous, selectedId, selectedId === null ? 'empty' : 'click');
  }

  #notify(previousId, selectedId, reason) {
    if (!this.#onChange) return;
    this.#lastCallbackError = null;
    try {
      this.#onChange(Object.freeze({ selectedId, previousId, nodeId: selectedId, reason }));
    } catch (error) {
      this.#lastCallbackError = Object.freeze({
        name: error && error.name ? String(error.name) : 'Error',
        message: error && error.message ? String(error.message) : 'selection callback failed'
      });
    }
  }

  #assertAlive() {
    if (this.#destroyed) throw new GraphRenderError('invalid-lifecycle', 'selection controller has been destroyed');
  }
}

function normalizeFrame(input, previousGeneration) {
  const scene = input.scene;
  if (!scene || typeof scene !== 'object' || typeof scene.phase !== 'string') {
    throw new GraphRenderError('invalid-frame', 'prepared scene phase is required');
  }
  const projection = scene.projection;
  if (!projection || typeof projection !== 'object'
      || typeof projection.width !== 'number' || !Number.isFinite(projection.width) || projection.width < 0
      || typeof projection.height !== 'number' || !Number.isFinite(projection.height) || projection.height < 0) {
    throw new GraphRenderError('invalid-frame', 'prepared scene projection width/height are required');
  }
  if (input.phase !== undefined && input.phase !== scene.phase) {
    throw new GraphRenderError('invalid-frame', 'phase must match prepared scene phase');
  }

  let viewport = { width: projection.width, height: projection.height };
  if (input.viewport !== undefined) {
    if (!input.viewport || typeof input.viewport !== 'object') {
      throw new GraphRenderError('invalid-frame', 'viewport must be an object when provided');
    }
    const width = nonNegative(input.viewport.width, 'viewport.width');
    const height = nonNegative(input.viewport.height, 'viewport.height');
    if (width !== projection.width || height !== projection.height) {
      throw new GraphRenderError('invalid-frame', 'viewport must match prepared scene projection');
    }
    viewport = { width, height };
  }

  let generation;
  if (input.generation === undefined) {
    generation = previousGeneration + 1;
  } else if (!Number.isSafeInteger(input.generation) || input.generation <= 0) {
    throw new GraphRenderError('invalid-frame', 'generation must be a positive safe integer');
  } else {
    generation = input.generation;
  }
  if (generation <= previousGeneration) {
    throw new GraphRenderError('invalid-frame', 'generation must strictly increase');
  }
  return Object.freeze({
    generation,
    phase: scene.phase,
    viewport: Object.freeze({ width: viewport.width, height: viewport.height })
  });
}
function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GraphRenderError('invalid-frame', `${label} must be finite and nonnegative`);
  }
  return value;
}


