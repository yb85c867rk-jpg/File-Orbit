import { GraphRenderError } from '../render/errors.js';
import { clientToCanvasCss } from '../interaction/pointer.js';
import {
  normalizeCamera,
  normalizeCameraLimits,
  normalizeWheelDelta,
  panCamera,
  requireViewport,
  wheelZoomFactor,
  zoomCameraAt
} from './camera.js';

export const DRAG_THRESHOLD_CSS = 4;

/**
 * Mouse-only pan/zoom controller. Owns canvas listeners; computes camera state
 * and delegates synchronous frame replacement through onCameraChange.
 */
export function createMouseNavigationController(canvas, options = {}) {
  if (!canvas || typeof canvas.addEventListener !== 'function'
      || typeof canvas.removeEventListener !== 'function') {
    throw new GraphRenderError('invalid-canvas', 'canvas with add/removeEventListener is required');
  }
  if (typeof options.onCameraChange !== 'function') {
    throw new GraphRenderError('invalid-navigation', 'onCameraChange is required');
  }
  const threshold = options.threshold === undefined ? DRAG_THRESHOLD_CSS : finiteNonNegative(options.threshold, 'threshold');
  const cameraLimits = normalizeCameraLimits(options.cameraLimits || undefined);
  const camera = normalizeCamera(options.camera || { zoom: 1, panX: 0, panY: 0 }, cameraLimits);
  const viewport = requireViewport(options.viewport);
  return new MouseNavigationController(canvas, {
    camera,
    viewport,
    cameraLimits,
    threshold,
    onCameraChange: options.onCameraChange,
    onDragStart: options.onDragStart,
    onDragEnd: options.onDragEnd,
    onError: options.onError
  });
}

class MouseNavigationController {
  #canvas;
  #camera;
  #viewport;
  #cameraLimits;
  #threshold;
  #onCameraChange;
  #onDragStart;
  #onDragEnd;
  #onError;
  #activePointerId = null;
  #captureOwned = false;
  #dragging = false;
  #suppressNextClick = false;
  #startX = 0;
  #startY = 0;
  #lastX = 0;
  #lastY = 0;
  #lastEvent = null;
  #error = null;
  #destroyed = false;
  #handlers;

  constructor(canvas, config) {
    this.#canvas = canvas;
    this.#camera = config.camera;
    this.#viewport = config.viewport;
    this.#cameraLimits = config.cameraLimits;
    this.#threshold = config.threshold;
    this.#onCameraChange = config.onCameraChange;
    this.#onDragStart = config.onDragStart;
    this.#onDragEnd = config.onDragEnd;
    this.#onError = config.onError;
    this.#handlers = {
      pointerdown: (event) => this.#pointerDown(event),
      pointermove: (event) => this.#pointerMove(event),
      pointerup: (event) => this.#pointerUp(event),
      pointercancel: (event) => this.#pointerCancel(event),
      lostpointercapture: (event) => this.#lostCapture(event),
      wheel: (event) => this.#wheel(event),
      click: (event) => this.#clickCapture(event)
    };
    canvas.addEventListener('pointerdown', this.#handlers.pointerdown);
    canvas.addEventListener('pointermove', this.#handlers.pointermove);
    canvas.addEventListener('pointerup', this.#handlers.pointerup);
    canvas.addEventListener('pointercancel', this.#handlers.pointercancel);
    canvas.addEventListener('lostpointercapture', this.#handlers.lostpointercapture);
    canvas.addEventListener('wheel', this.#handlers.wheel, { passive: false });
    canvas.addEventListener('click', this.#handlers.click, true);
  }

  getState() {
    return Object.freeze({
      camera: { ...this.#camera },
      viewport: { ...this.#viewport },
      cameraLimits: { ...this.#cameraLimits },
      threshold: this.#threshold,
      activePointerId: this.#activePointerId,
      captureOwned: this.#captureOwned,
      dragging: this.#dragging,
      suppressNextClick: this.#suppressNextClick,
      lastEvent: this.#lastEvent,
      error: this.#error
    });
  }

  update(input) {
    if (this.#destroyed) throw new GraphRenderError('invalid-lifecycle', 'navigation controller has been destroyed');
    if (!input || typeof input !== 'object') throw new GraphRenderError('invalid-navigation', 'update input is required');
    const nextLimits = input.cameraLimits === undefined ? this.#cameraLimits : normalizeCameraLimits(input.cameraLimits);
    const nextCamera = normalizeCamera(input.camera, nextLimits);
    const nextViewport = requireViewport(input.viewport);
    this.#camera = nextCamera;
    this.#viewport = nextViewport;
    this.#cameraLimits = nextLimits;
    this.#error = null;
    return this.getState();
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#releaseCapture();
    this.#canvas.removeEventListener('pointerdown', this.#handlers.pointerdown);
    this.#canvas.removeEventListener('pointermove', this.#handlers.pointermove);
    this.#canvas.removeEventListener('pointerup', this.#handlers.pointerup);
    this.#canvas.removeEventListener('pointercancel', this.#handlers.pointercancel);
    this.#canvas.removeEventListener('lostpointercapture', this.#handlers.lostpointercapture);
    this.#canvas.removeEventListener('wheel', this.#handlers.wheel, { passive: false });
    this.#canvas.removeEventListener('click', this.#handlers.click, true);
    this.#activePointerId = null;
    this.#dragging = false;
    this.#canvas = null;
    this.#onCameraChange = null;
    this.#onDragStart = null;
    this.#onDragEnd = null;
    this.#onError = null;
  }

  #pointerDown(event) {
    if (!this.#canvas) return;
    if (!isMousePointer(event) || event.button !== 0 || event.isPrimary === false) {
      this.#lastEvent = { kind: 'pointerdown', handled: false, reason: 'unsupported-pointer' };
      return;
    }
    if (!finitePointer(event)) {
      this.#fail(new GraphRenderError('invalid-pointer', 'pointer coordinates must be finite'));
      this.#lastEvent = { kind: 'pointerdown', handled: false, reason: 'invalid-coordinate' };
      return;
    }
    if (this.#activePointerId !== null) return;
    this.#activePointerId = event.pointerId;
    this.#startX = event.clientX;
    this.#startY = event.clientY;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    this.#dragging = false;
    this.#suppressNextClick = false;
    this.#captureOwned = false;
    if (typeof this.#canvas.setPointerCapture === 'function') {
      try {
        this.#canvas.setPointerCapture(event.pointerId);
        this.#captureOwned = true;
      } catch {
        this.#captureOwned = false;
      }
    }
    this.#lastEvent = { kind: 'pointerdown', handled: true, reason: 'primary-mouse' };
  }

  #pointerMove(event) {
    if (this.#activePointerId !== event.pointerId || !isMousePointer(event)) return;
    if (!finitePointer(event)) {
      this.#abortActiveDrag(new GraphRenderError('invalid-pointer', 'pointer coordinates must be finite'));
      return;
    }
    const dx = event.clientX - this.#startX;
    const dy = event.clientY - this.#startY;
    if (!this.#dragging) {
      if (Math.hypot(dx, dy) < this.#threshold) {
        this.#lastEvent = { kind: 'pointermove', handled: false, reason: 'below-threshold' };
        return;
      }
      if (!this.#notifyDragStart()) {
        this.#endPointer(false);
        return;
      }
      this.#dragging = true;
      this.#lastX = this.#startX;
      this.#lastY = this.#startY;
    }
    const stepX = event.clientX - this.#lastX;
    const stepY = event.clientY - this.#lastY;
    if (stepX === 0 && stepY === 0) return;
    let next;
    try {
      next = panCamera(this.#camera, stepX, stepY, this.#cameraLimits);
    } catch (error) {
      this.#abortActiveDrag(error);
      return;
    }
    if (!this.#applyCamera(next, { kind: 'drag', dx: stepX, dy: stepY })) {
      if (this.#dragging) this.#suppressNextClick = true;
      this.#endPointer(false);
      return;
    }
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    this.#lastEvent = { kind: 'drag', handled: true, reason: 'pan' };
  }

  #pointerUp(event) {
    if (this.#activePointerId !== event.pointerId) return;
    if (!finitePointer(event)) {
      this.#abortActiveDrag(new GraphRenderError('invalid-pointer', 'pointer coordinates must be finite'));
      return;
    }
    const wasDragging = this.#dragging;
    if (wasDragging) this.#suppressNextClick = true;
    this.#lastEvent = {
      kind: 'pointerup',
      handled: true,
      reason: wasDragging ? 'drag-end' : 'click-candidate'
    };
    this.#endPointer(wasDragging);
  }

  #pointerCancel(event) {
    if (this.#activePointerId !== event.pointerId) return;
    this.#lastEvent = { kind: 'pointercancel', handled: true, reason: 'cancelled' };
    this.#endPointer(this.#dragging);
  }

  #lostCapture(event) {
    if (this.#activePointerId === null || this.#activePointerId !== event.pointerId) return;
    this.#lastEvent = { kind: 'lostpointercapture', handled: true, reason: 'capture-lost' };
    this.#endPointer(false);
  }

  #wheel(event) {
    if (event.ctrlKey || event.metaKey) {
      this.#lastEvent = { kind: 'wheel', handled: false, reason: 'modified-wheel' };
      return;
    }
    if (typeof event.deltaY !== 'number' || !Number.isFinite(event.deltaY)) {
      this.#lastEvent = { kind: 'wheel', handled: false, reason: 'invalid-delta' };
      return;
    }
    let normalized;
    let anchor;
    let next;
    try {
      normalized = normalizeWheelDelta(event.deltaY, event.deltaMode ?? 0, this.#viewport);
      anchor = clientToCanvasCss(this.#canvas, event.clientX, event.clientY);
      if (!finitePoint(anchor)) throw new GraphRenderError('invalid-pointer', 'wheel anchor is not finite');
      if (normalized === 0) {
        this.#lastEvent = { kind: 'wheel', handled: false, reason: 'zero-delta' };
        return;
      }
      next = zoomCameraAt(this.#camera, wheelZoomFactor(normalized), anchor, this.#viewport, this.#cameraLimits);
    } catch (error) {
      this.#fail(error);
      this.#lastEvent = { kind: 'wheel', handled: false, reason: 'invalid-coordinate' };
      return;
    }
    if (!this.#applyCamera(next, { kind: 'wheel', delta: normalized, anchor })) {
      this.#lastEvent = { kind: 'wheel', handled: false, reason: 'frame-failed' };
      return;
    }
    event.preventDefault();
    this.#lastEvent = { kind: 'wheel', handled: true, reason: 'zoom' };
  }

  #clickCapture(event) {
    if (!this.#suppressNextClick) return;
    this.#suppressNextClick = false;
    event.stopImmediatePropagation();
    event.preventDefault();
    this.#lastEvent = { kind: 'click', handled: true, reason: 'suppressed-post-drag-click' };
  }

  #applyCamera(next, meta) {
    let returned;
    try {
      returned = this.#onCameraChange(next, meta);
      if (returned && typeof returned.then === 'function') {
        throw new GraphRenderError('async-frame-unsupported', 'camera frame replacement must be synchronous');
      }
    } catch (error) {
      this.#error = error instanceof GraphRenderError
        ? error
        : new GraphRenderError('camera-frame-failed', error && error.message ? error.message : 'camera frame failed');
      this.#lastEvent = { kind: meta.kind, handled: false, reason: 'frame-failed' };
      this.#notify(this.#onError, Object.freeze({ error: this.#error, state: this.getState() }));
      return false;
    }
    this.#camera = next;
    this.#error = null;
    return true;
  }

  #notifyDragStart() {
    return this.#notify(this.#onDragStart, Object.freeze({ kind: 'drag-start' }));
  }

  #notifyDragEnd() {
    this.#notify(this.#onDragEnd, Object.freeze({ kind: 'drag-end' }));
  }

  #abortActiveDrag(error) {
    if (this.#dragging) this.#suppressNextClick = true;
    this.#endPointer(false);
    this.#fail(error);
  }

  #endPointer(notify = true) {
    if (this.#activePointerId === null) return;
    this.#releaseCapture();
    this.#activePointerId = null;
    this.#dragging = false;
    if (notify) this.#notifyDragEnd();
  }

  #releaseCapture() {
    if (!this.#captureOwned || this.#activePointerId === null) return;
    if (typeof this.#canvas.releasePointerCapture === 'function') {
      try {
        this.#canvas.releasePointerCapture(this.#activePointerId);
      } catch {
        // Capture may already be gone.
      }
    }
    this.#captureOwned = false;
  }

  #notify(callback, payload) {
    if (typeof callback !== 'function') return true;
    try {
      callback(payload);
      return true;
    } catch (error) {
      this.#fail(error, callback !== this.#onError);
      return false;
    }
  }

  #fail(error, notify = true) {
    this.#error = error instanceof GraphRenderError
      ? error
      : new GraphRenderError('navigation-failed', error && error.message ? error.message : 'navigation failed');
    this.#lastEvent = { kind: 'error', handled: false, reason: 'navigation-failed' };
    if (notify) this.#notify(this.#onError, Object.freeze({ error: this.#error, state: this.getState() }));
  }
}

function isMousePointer(event) {
  return event && event.pointerType === 'mouse';
}

function finiteNonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GraphRenderError('invalid-navigation', `${label} must be finite and nonnegative`);
  }
  return value;
}
function finitePointer(event) {
  return typeof event.clientX === 'number' && Number.isFinite(event.clientX)
    && typeof event.clientY === 'number' && Number.isFinite(event.clientY);
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

