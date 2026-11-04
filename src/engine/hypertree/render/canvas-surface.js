/**
 * Owned Canvas 2D surface.
 *
 * CSS coordinates are canvas-local CSS pixels with the origin at the top-left.
 * The Hypertree center/radius mapping lives in coordinates.js. The context
 * transform only maps CSS pixels to integer backing-store pixels; the effective
 * scale accounts for backing-size rounding and is applied exactly once.
 */

export const SURFACE_LIMITS = Object.freeze({
  maxCssSide: 16384,
  maxBackingSide: 16384,
  maxBackingPixels: 33554432
});

export class CanvasSurfaceError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'CanvasSurfaceError';
    this.code = code;
  }
}

/**
 * Create one owned canvas in `host`. The host's ownerDocument is used; no
 * global document lookup or import-time DOM access occurs.
 *
 * @param {HTMLElement} host
 * @param {{width:number, height:number, dpr:number}} options
 */
export function createCanvasSurface(host, options) {
  if (!host || typeof host.appendChild !== 'function' || !host.ownerDocument
      || typeof host.ownerDocument.createElement !== 'function') {
    throw new CanvasSurfaceError('invalid-host', 'host with ownerDocument.appendChild is required');
  }
  const metrics = computeMetrics(options);
  const doc = host.ownerDocument;
  const canvas = doc.createElement('canvas');
  let ctx;
  try {
    canvas.width = metrics.backingWidth;
    canvas.height = metrics.backingHeight;
    canvas.style.width = `${metrics.cssWidth}px`;
    canvas.style.height = `${metrics.cssHeight}px`;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new CanvasSurfaceError('context-unavailable', '2D context is unavailable');
    host.appendChild(canvas);
    ctx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
  } catch (error) {
    if (canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas);
    }
    if (error instanceof CanvasSurfaceError) throw error;
    throw new CanvasSurfaceError('initialization-failed', `canvas initialization failed: ${error.message}`);
  }
  return new CanvasSurface(host, canvas, ctx, metrics);
}

class CanvasSurface {
  #host;
  #canvas;
  #ctx;
  #metrics;
  #destroyed = false;

  constructor(host, canvas, ctx, metrics) {
    this.#host = host;
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#metrics = metrics;
  }

  get canvas() {
    this.#assertAlive();
    return this.#canvas;
  }

  get context() {
    this.#assertAlive();
    return this.#ctx;
  }

  /** @returns {Readonly<object>} */
  getMetrics() {
    this.#assertAlive();
    return Object.freeze({ ...this.#metrics });
  }

  /**
   * Resize/DPR update. Invalid input is rejected before any surface state
   * changes. The complete transform is reapplied after the backing reset.
   * @param {{width:number, height:number, dpr:number}} options
   */
  resize(options) {
    this.#assertAlive();
    const next = computeMetrics(options);
    const canvas = this.#canvas;
    canvas.width = next.backingWidth;
    canvas.height = next.backingHeight;
    canvas.style.width = `${next.cssWidth}px`;
    canvas.style.height = `${next.cssHeight}px`;
    this.#metrics = next;
    this.#applyTransform();
    this.clear();
  }

  /**
   * Clear the entire backing store regardless of the current transform and
   * restore the documented CSS-to-backing transform.
   */
  clear() {
    this.#assertAlive();
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#metrics.backingWidth, this.#metrics.backingHeight);
    this.#applyTransform();
  }

  /** Idempotent; removes only this instance's canvas. */
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const canvas = this.#canvas;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    this.#host = null;
    this.#canvas = null;
    this.#ctx = null;
    this.#metrics = null;
  }

  #applyTransform() {
    this.#ctx.setTransform(this.#metrics.scaleX, 0, 0, this.#metrics.scaleY, 0, 0);
  }

  #assertAlive() {
    if (this.#destroyed) throw new CanvasSurfaceError('destroyed', 'canvas surface has been destroyed');
  }
}

function computeMetrics(options) {
  if (!options || typeof options !== 'object') {
    throw new CanvasSurfaceError('invalid-size', 'width, height, and dpr are required');
  }
  const cssWidth = nonNegative(options.width, 'width');
  const cssHeight = nonNegative(options.height, 'height');
  const dpr = positive(options.dpr, 'dpr');
  if (cssWidth > SURFACE_LIMITS.maxCssSide || cssHeight > SURFACE_LIMITS.maxCssSide) {
    throw new CanvasSurfaceError('oversize', 'CSS dimensions exceed the surface policy limit');
  }
  const backingWidth = Math.round(cssWidth * dpr);
  const backingHeight = Math.round(cssHeight * dpr);
  if (backingWidth > SURFACE_LIMITS.maxBackingSide || backingHeight > SURFACE_LIMITS.maxBackingSide) {
    throw new CanvasSurfaceError('oversize', 'backing dimensions exceed the surface policy limit');
  }
  if (backingWidth * backingHeight > SURFACE_LIMITS.maxBackingPixels) {
    throw new CanvasSurfaceError('oversize', 'backing pixel count exceeds the surface policy limit');
  }
  return {
    cssWidth,
    cssHeight,
    dpr,
    backingWidth,
    backingHeight,
    // Effective scales account for integer rounding. A zero dimension has a
    // zero scale and never divides by zero.
    scaleX: cssWidth === 0 ? 0 : backingWidth / cssWidth,
    scaleY: cssHeight === 0 ? 0 : backingHeight / cssHeight
  };
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CanvasSurfaceError('invalid-size', `${label} must be finite`);
  }
  return value;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new CanvasSurfaceError('invalid-size', `${label} must be >= 0`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new CanvasSurfaceError('invalid-size', `${label} must be > 0`);
  return number;
}
