/**
 * Pure Möbius focus-transition arithmetic.
 *
 * A view is represented by one parameter c in T_c(z)=(z+c)/(1+conj(c)z).
 * Intermediate frames interpolate c, not node coordinates, and always resolve
 * every node from the authoritative base layout.
 */
import { GraphRenderError } from '../render/errors.js';
import {
  createFocusViewAtParameter,
  focusParameter
} from './focus-view.js';

export const DEFAULT_FOCUS_DURATION_MS = 300;
export const MAX_FOCUS_DURATION_MS = 10000;

/** Deterministic ease-in-out cubic. */
export function easeInOutCubic(t) {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - ((-2 * t + 2) ** 3) / 2;
}

export function clampProgress(progress) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    throw new GraphRenderError('invalid-progress', 'progress must be finite');
  }
  return Math.min(1, Math.max(0, progress));
}

/**
 * @param {object} base accepted staged layout
 * @param {{
 *   focusId: string,
 *   phase?: string,
 *   fromParameter?: {x:number,y:number},
 *   progress: number
 * }} options
 */
export function sampleFocusTransition(base, options = {}) {
  const from = options.fromParameter === undefined
    ? { x: 0, y: 0 }
    : requireParameter(options.fromParameter, 'fromParameter');
  const to = focusParameter(base, options.focusId, options.phase);
  const raw = clampProgress(options.progress);
  const eased = easeInOutCubic(raw);
  let parameter;
  if (eased === 0) parameter = from;
  else if (eased === 1) parameter = to;
  else parameter = {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased
  };
  const view = createFocusViewAtParameter(base, {
    phase: options.phase,
    focusId: options.focusId,
    parameter
  });
  return {
    progress: raw,
    eased,
    parameter,
    view
  };
}

function requireParameter(parameter, label) {
  if (!parameter || typeof parameter !== 'object'
      || typeof parameter.x !== 'number' || !Number.isFinite(parameter.x)
      || typeof parameter.y !== 'number' || !Number.isFinite(parameter.y)
      || Math.hypot(parameter.x, parameter.y) >= 1) {
    throw new GraphRenderError('invalid-focus', `${label} must be finite and strictly inside the open disk`);
  }
  return { x: parameter.x, y: parameter.y };
}
