import { GraphRenderError } from '../render/errors.js';
import {
  CAMERA_LIMITS,
  cameraForward,
  normalizeCamera,
  normalizeCameraLimits
} from './camera.js';

export const FIT_TOLERANCE_CSS = 1e-6;
export const DEFAULT_FIT_PADDING = 16;

/**
 * Pure fit-camera calculation over base-CSS node geometry (before camera).
 * Returns a result object; it does not mutate nodes or throw for ordinary
 * infeasibility. Throws only for a malformed API call.
 */
export function calculateFitCamera(input = {}) {
  const viewport = input.viewport;
  if (!validNumber(viewport?.width) || !validNumber(viewport?.height)
      || viewport.width <= 0 || viewport.height <= 0) {
    return failure('invalid-viewport', { viewport });
  }
  const padding = normalizePadding(input.padding);
  if (!padding.ok) return failure(padding.reason, { padding: input.padding });
  if (padding.x * 2 >= viewport.width || padding.y * 2 >= viewport.height) {
    return failure('padding-exceeds-viewport', { padding, viewport });
  }
  const presentation = input.presentation || { kind: 'native' };
  const fixed = presentation.kind === 'fixed';
  const glyphRadius = presentation.glyphRadiusCss === undefined
    ? 6
    : presentation.glyphRadiusCss;
  if (!validNumber(glyphRadius) || glyphRadius <= 0) {
    return failure('invalid-presentation', { presentation });
  }
  const projectionScale = input.projectionScale === undefined ? 1 : input.projectionScale;
  if (!validNumber(projectionScale) || projectionScale <= 0) {
    return failure('invalid-projection-scale', { projectionScale });
  }
  let limits;
  try {
    limits = normalizeCameraLimits(input.limits || CAMERA_LIMITS);
  } catch (error) {
    return failure(error.code || 'invalid-camera-limits', { error: error.message });
  }
  const rawNodes = input.nodes;
  const nodes = rawNodes instanceof Map ? [...rawNodes.values()] : rawNodes;
  if (!Array.isArray(nodes)) return failure('invalid-geometry', { reason: 'nodes must be an array or Map' });

  const eligible = [];
  for (const node of nodes) {
    if (!node || node.visible === false) continue;
    if (!validNumber(node.center?.x) || !validNumber(node.center?.y)
        || !validNumber(node.radius) || node.radius < 0) {
      return failure('invalid-geometry', { nodeId: node?.id ?? null });
    }
    eligible.push(node);
  }
  if (eligible.length === 0) {
    return {
      ok: true,
      empty: true,
      reason: 'empty',
      camera: normalizeCamera({ zoom: 1, panX: 0, panY: 0 }, limits),
      eligibleCount: 0,
      containedCount: 0,
      clippedCount: 0,
      clippedIds: [],
      padding,
      presentation: { kind: fixed ? 'fixed' : 'native', glyphRadiusCss: fixed ? glyphRadius : null },
      projectionScale,
      requiredZoom: 1,
      appliedZoom: 1,
      requiredBelowMin: false,
      limits,
      bounds: null,
      toleranceCss: FIT_TOLERANCE_CSS
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of eligible) {
    const extent = fixed ? 0 : node.radius;
    minX = Math.min(minX, node.center.x - extent);
    minY = Math.min(minY, node.center.y - extent);
    maxX = Math.max(maxX, node.center.x + extent);
    maxY = Math.max(maxY, node.center.y + extent);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const fixedRadius = fixed ? glyphRadius : 0;
  const availableW = viewport.width - padding.x * 2 - fixedRadius * 2;
  const availableH = viewport.height - padding.y * 2 - fixedRadius * 2;
  if (availableW <= 0 || availableH <= 0) {
    return failure('glyph-exceeds-viewport', { padding, viewport, glyphRadius, fixed });
  }
  let requiredZoom;
  if (spanX <= FIT_TOLERANCE_CSS && spanY <= FIT_TOLERANCE_CSS) {
    requiredZoom = Math.min(1, limits.maxZoom);
  } else {
    const zx = spanX > FIT_TOLERANCE_CSS ? availableW / spanX : Infinity;
    const zy = spanY > FIT_TOLERANCE_CSS ? availableH / spanY : Infinity;
    requiredZoom = Math.min(zx, zy);
  }
  if (!validNumber(requiredZoom) || requiredZoom <= 0) {
    return failure('invalid-fit', { requiredZoom, spanX, spanY });
  }
  if (requiredZoom > limits.maxZoom) {
    return failure('max-zoom-exceeded', { requiredZoom, limits });
  }
  if (requiredZoom < limits.minZoom) {
    return failure('min-zoom-exceeded', {
      requiredZoom, limits, requiredBelowMin: true
    });
  }

  const zoom = requiredZoom;
  const panX = -(centerX - viewport.width / 2) * zoom;
  const panY = -(centerY - viewport.height / 2) * zoom;
  let camera;
  try {
    camera = normalizeCamera({ zoom, panX, panY }, limits);
  } catch (error) {
    return failure(error.code || 'invalid-fit', { error: error.message, zoom, panX, panY });
  }

  let contained = 0;
  const clippedIds = [];
  const screenBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of eligible) {
    const screen = cameraForward(camera, node.center, viewport, limits);
    const r = fixed ? glyphRadius : node.radius * camera.zoom;
    const left = screen.x - r;
    const top = screen.y - r;
    const right = screen.x + r;
    const bottom = screen.y + r;
    screenBounds.minX = Math.min(screenBounds.minX, left);
    screenBounds.minY = Math.min(screenBounds.minY, top);
    screenBounds.maxX = Math.max(screenBounds.maxX, right);
    screenBounds.maxY = Math.max(screenBounds.maxY, bottom);
    const inside = left >= padding.x - FIT_TOLERANCE_CSS
      && top >= padding.y - FIT_TOLERANCE_CSS
      && right <= viewport.width - padding.x + FIT_TOLERANCE_CSS
      && bottom <= viewport.height - padding.y + FIT_TOLERANCE_CSS;
    if (inside) contained += 1;
    else clippedIds.push(node.id);
  }
  const clipped = clippedIds.length;
  const result = {
    ok: clipped === 0,
    empty: false,
    reason: clipped === 0 ? 'fitted' : 'glyph-clipped',
    camera,
    eligibleCount: eligible.length,
    containedCount: contained,
    clippedCount: clipped,
    clippedIds,
    padding,
    presentation: { kind: fixed ? 'fixed' : 'native', glyphRadiusCss: fixed ? glyphRadius : null },
    projectionScale,
    requiredZoom,
    appliedZoom: camera.zoom,
    requiredBelowMin: false,
    limits,
    bounds: screenBounds,
    baseBounds: { minX, minY, maxX, maxY },
    toleranceCss: FIT_TOLERANCE_CSS
  };
  if (!result.ok) return result;
  return result;
}

function failure(reason, details = {}) {
  return {
    ok: false,
    empty: false,
    reason,
    camera: null,
    eligibleCount: 0,
    containedCount: 0,
    clippedCount: 0,
    clippedIds: [],
    requiredZoom: null,
    appliedZoom: null,
    requiredBelowMin: reason === 'min-zoom-exceeded',
    toleranceCss: FIT_TOLERANCE_CSS,
    ...details
  };
}

function normalizePadding(value) {
  if (value === undefined) return { ok: true, x: DEFAULT_FIT_PADDING, y: DEFAULT_FIT_PADDING };
  if (typeof value === 'number') {
    if (!validNumber(value) || value < 0) return { ok: false, reason: 'invalid-padding' };
    return { ok: true, x: value, y: value };
  }
  if (!value || typeof value !== 'object') return { ok: false, reason: 'invalid-padding' };
  if (!validNumber(value.x) || !validNumber(value.y) || value.x < 0 || value.y < 0) {
    return { ok: false, reason: 'invalid-padding' };
  }
  return { ok: true, x: value.x, y: value.y };
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function requireFitCamera(result) {
  if (!result || !result.ok || !result.camera) {
    throw new GraphRenderError(
      'fit-infeasible',
      result && result.reason ? `fit is not applicable: ${result.reason}` : 'fit is not applicable'
    );
  }
  return result.camera;
}
