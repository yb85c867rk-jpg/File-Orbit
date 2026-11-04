import { GraphRenderError } from '../render/errors.js';

export const CAMERA_LIMITS = Object.freeze({
  minZoom: 0.25,
  maxZoom: 8,
  maxPanCss: 1_000_000,
  wheelLineCss: 16,
  wheelMaxCss: 1200,
  zoomSensitivity: 0.0015
});

export const EXPERIMENTAL_CAMERA_LIMITS = Object.freeze({
  ...CAMERA_LIMITS,
  minZoom: 0.02
});

export const DEFAULT_CAMERA = Object.freeze({ zoom: 1, panX: 0, panY: 0 });

export function createCamera(initial = DEFAULT_CAMERA, limits = CAMERA_LIMITS) {
  return normalizeCamera(initial, limits);
}

export function normalizeCamera(camera, limits = CAMERA_LIMITS) {
  const bounds = normalizeCameraLimits(limits);
  if (!camera || typeof camera !== 'object') {
    throw new GraphRenderError('invalid-camera', 'camera is required');
  }
  const zoom = finite(camera.zoom, 'camera.zoom');
  const panX = finite(camera.panX, 'camera.panX');
  const panY = finite(camera.panY, 'camera.panY');
  if (zoom < bounds.minZoom || zoom > bounds.maxZoom) {
    throw new GraphRenderError('invalid-camera', `camera.zoom must be within ${bounds.minZoom}..${bounds.maxZoom}`);
  }
  if (Math.abs(panX) > bounds.maxPanCss || Math.abs(panY) > bounds.maxPanCss) {
    throw new GraphRenderError('invalid-camera', `camera pan must be within +/-${bounds.maxPanCss} CSS px`);
  }
  return Object.freeze({ zoom, panX, panY });
}

export function normalizeCameraLimits(limits = CAMERA_LIMITS) {
  if (!limits || typeof limits !== 'object') {
    throw new GraphRenderError('invalid-camera-limits', 'camera limits must be an object');
  }
  const minZoom = finite(limits.minZoom, 'limits.minZoom');
  const maxZoom = finite(limits.maxZoom, 'limits.maxZoom');
  const maxPanCss = finite(limits.maxPanCss, 'limits.maxPanCss');
  if (minZoom <= 0 || maxZoom < minZoom) {
    throw new GraphRenderError('invalid-camera-limits', 'camera zoom limits must satisfy 0 < minZoom <= maxZoom');
  }
  if (maxPanCss <= 0) throw new GraphRenderError('invalid-camera-limits', 'maxPanCss must be positive');
  const wheelLineCss = limits.wheelLineCss === undefined ? CAMERA_LIMITS.wheelLineCss : finite(limits.wheelLineCss, 'limits.wheelLineCss');
  const wheelMaxCss = limits.wheelMaxCss === undefined ? CAMERA_LIMITS.wheelMaxCss : finite(limits.wheelMaxCss, 'limits.wheelMaxCss');
  const zoomSensitivity = limits.zoomSensitivity === undefined ? CAMERA_LIMITS.zoomSensitivity : finite(limits.zoomSensitivity, 'limits.zoomSensitivity');
  if (wheelLineCss <= 0 || wheelMaxCss <= 0 || zoomSensitivity <= 0) {
    throw new GraphRenderError('invalid-camera-limits', 'wheel limits must be positive');
  }
  return Object.freeze({ minZoom, maxZoom, maxPanCss, wheelLineCss, wheelMaxCss, zoomSensitivity });
}

export function requireViewport(viewport) {
  if (!viewport || typeof viewport !== 'object') {
    throw new GraphRenderError('invalid-viewport', 'viewport is required');
  }
  const width = finite(viewport.width, 'viewport.width');
  const height = finite(viewport.height, 'viewport.height');
  if (width < 0 || height < 0) throw new GraphRenderError('invalid-viewport', 'viewport dimensions must be nonnegative');
  return Object.freeze({ width, height });
}

/** screen = viewportCenter + pan + zoom * (baseCss - viewportCenter) */
export function cameraForward(camera, point, viewport, limits = CAMERA_LIMITS) {
  const cam = normalizeCamera(camera, limits);
  const vp = requireViewport(viewport);
  const p = finitePoint(point, 'baseCss');
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  return {
    x: cx + cam.panX + cam.zoom * (p.x - cx),
    y: cy + cam.panY + cam.zoom * (p.y - cy)
  };
}

export function cameraInverse(camera, point, viewport, limits = CAMERA_LIMITS) {
  const cam = normalizeCamera(camera, limits);
  const vp = requireViewport(viewport);
  const p = finitePoint(point, 'screenCss');
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  return {
    x: cx + (p.x - cx - cam.panX) / cam.zoom,
    y: cy + (p.y - cy - cam.panY) / cam.zoom
  };
}

export function panCamera(camera, dx, dy, limits = CAMERA_LIMITS) {
  const bounds = normalizeCameraLimits(limits);
  const cam = normalizeCamera(camera, bounds);
  const x = finite(dx, 'pan dx');
  const y = finite(dy, 'pan dy');
  return normalizeCamera({
    zoom: cam.zoom,
    panX: clamp(cam.panX + x, -bounds.maxPanCss, bounds.maxPanCss),
    panY: clamp(cam.panY + y, -bounds.maxPanCss, bounds.maxPanCss)
  }, bounds);
}

/** Zoom so the world point under screen anchor remains fixed. */
export function zoomCameraAt(camera, factor, anchor, viewport, limits = CAMERA_LIMITS) {
  const bounds = normalizeCameraLimits(limits);
  const cam = normalizeCamera(camera, bounds);
  const vp = requireViewport(viewport);
  const f = finite(factor, 'zoom factor');
  if (f <= 0) throw new GraphRenderError('invalid-camera', 'zoom factor must be positive');
  const nextZoom = clamp(cam.zoom * f, bounds.minZoom, bounds.maxZoom);
  const anchorPoint = finitePoint(anchor, 'anchor');
  const world = cameraInverse(cam, anchorPoint, vp, bounds);
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  let panX = anchorPoint.x - cx - nextZoom * (world.x - cx);
  let panY = anchorPoint.y - cy - nextZoom * (world.y - cy);
  panX = clamp(panX, -bounds.maxPanCss, bounds.maxPanCss);
  panY = clamp(panY, -bounds.maxPanCss, bounds.maxPanCss);
  return normalizeCamera({ zoom: nextZoom, panX, panY }, bounds);
}

export function resetCamera() {
  return DEFAULT_CAMERA;
}

/** Convert wheel delta to CSS pixels; only pixel/line/page modes supported. */
export function normalizeWheelDelta(delta, deltaMode, viewport) {
  const value = finite(delta, 'wheel delta');
  const mode = finite(deltaMode, 'wheel deltaMode');
  if (mode !== 0 && mode !== 1 && mode !== 2) {
    throw new GraphRenderError('invalid-wheel', 'wheel deltaMode must be 0, 1, or 2');
  }
  const vp = requireViewport(viewport);
  const factor = mode === 0 ? 1 : mode === 1 ? CAMERA_LIMITS.wheelLineCss : vp.height;
  return clamp(value * factor, -CAMERA_LIMITS.wheelMaxCss, CAMERA_LIMITS.wheelMaxCss);
}

export function wheelZoomFactor(normalizedDelta) {
  const delta = finite(normalizedDelta, 'wheel normalized delta');
  return Math.exp(-delta * CAMERA_LIMITS.zoomSensitivity);
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GraphRenderError('invalid-camera', `${label} must be finite`);
  }
  return value;
}

function finitePoint(point, label) {
  if (!point || typeof point !== 'object') throw new GraphRenderError('invalid-camera', `${label} must be a point`);
  return { x: finite(point.x, `${label}.x`), y: finite(point.y, `${label}.y`) };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
