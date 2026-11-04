import { GraphRenderError } from '../render/errors.js';

/**
 * Convert a mouse client coordinate to canvas-local CSS pixels.
 *
 * Uses the canvas border box and its declared canvas border/padding at event
 * time. Page scrolling is naturally reflected by getBoundingClientRect().
 * DPR is never applied. Translation-only: CSS transform scaling/rotation is not
 * supported, and host padding/internal scrolling must not move the canvas
 * relative to its content origin without an explicit update.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
export function clientToCanvasCss(canvas, clientX, clientY) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') {
    throw new GraphRenderError('invalid-canvas', 'canvas with getBoundingClientRect is required');
  }
  const x = finite(clientX, 'clientX');
  const y = finite(clientY, 'clientY');
  const rect = canvas.getBoundingClientRect();
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
    throw new GraphRenderError('invalid-canvas', 'canvas client rect is invalid');
  }

  const borderLeft = nonNegative(canvas.clientLeft, 0);
  const borderTop = nonNegative(canvas.clientTop, 0);
  let paddingLeft = 0;
  let paddingTop = 0;
  const doc = canvas.ownerDocument;
  const view = doc && doc.defaultView;
  if (view && typeof view.getComputedStyle === 'function') {
    const style = view.getComputedStyle(canvas);
    paddingLeft = cssPixels(style && style.paddingLeft);
    paddingTop = cssPixels(style && style.paddingTop);
  }

  return {
    x: x - rect.left - borderLeft - paddingLeft,
    y: y - rect.top - borderTop - paddingTop
  };
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GraphRenderError('invalid-point', `${label} must be finite`);
  }
  return value;
}

function nonNegative(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cssPixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
