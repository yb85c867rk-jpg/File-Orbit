import { GraphRenderError } from '../render/errors.js';
import { createProjection } from '../render/coordinates.js';
import { calculateFitCamera } from './fit.js';
import { applyCameraToScene } from './camera-scene.js';

/**
 * Resolve the workspace-expanded projection used by both fit calculation and
 * the installed frame. This is the single projection boundary for the harness.
 */
export function resolveFitProjection({ viewport, baseRadiusCss, workspaceScale }) {
  if (!viewport || !positive(viewport.width) || !positive(viewport.height)) {
    throw new TypeError('viewport must have positive width/height');
  }
  if (!positive(baseRadiusCss) || !positive(workspaceScale)) {
    throw new TypeError('baseRadiusCss and workspaceScale must be positive');
  }
  return createProjection({
    width: viewport.width,
    height: viewport.height,
    radius: baseRadiusCss * workspaceScale
  });
}

/**
 * Prepare the exact base scene, projection, and fit camera consumed by the
 * subsequent frame installation.
 */
export function prepareFitFrame({
  view,
  phase,
  viewport,
  baseRadiusCss,
  workspaceScale,
  padding,
  presentation,
  limits,
  prepareScene,
  applyFixedGlyph
}) {
  if (!view || typeof prepareScene !== 'function') {
    throw new TypeError('view and prepareScene are required');
  }
  const projection = resolveFitProjection({ viewport, baseRadiusCss, workspaceScale });
  const baseScene = prepareScene(view, projection);
  const fitScene = typeof applyFixedGlyph === 'function'
    ? applyFixedGlyph(baseScene)
    : baseScene;
  const fit = calculateFitCamera({
    nodes: [...fitScene.nodes.values()],
    viewport,
    padding,
    presentation,
    projectionScale: workspaceScale,
    limits
  });
  return { view, phase, projection, baseScene, fitScene, fit, workspaceScale };
}

/** Resize policy: refit in fit mode; preserve the current camera in manual mode. */
export function resolveResizeFraming({ framingMode, currentCamera, fitCamera }) {
  if (framingMode === 'fit') {
    if (!fitCamera) return { mode: 'fit', camera: null };
    return { mode: 'fit', camera: fitCamera };
  }
  return { mode: 'manual', camera: currentCamera };
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
/** Accept only the exact prepared projection for the current viewport. */
export function resolveFrameProjection({ supplied, expected }) {
  if (!expected || !positive(expected.width) || !positive(expected.height) || !positive(expected.radius)) {
    throw new GraphRenderError('invalid-projection', 'expected projection is invalid');
  }
  if (!supplied) return expected;
  const valid = positive(supplied.width) && positive(supplied.height) && positive(supplied.radius)
    && Math.abs(supplied.width - expected.width) <= 1e-9
    && Math.abs(supplied.height - expected.height) <= 1e-9
    && Math.abs(supplied.radius - expected.radius) <= 1e-9;
  if (!valid) {
    throw new GraphRenderError('projection-mismatch', 'supplied projection does not match the current viewport/workspace');
  }
  return supplied;
}
/** Prepare the installed camera scene with exactly the validated projection. */
export function prepareCameraFrame({
  view,
  camera,
  viewport,
  suppliedProjection,
  expectedProjection,
  limits,
  prepareScene,
  applyFixedGlyph
}) {
  if (!view || typeof prepareScene !== 'function') {
    throw new TypeError('view and prepareScene are required');
  }
  const projection = resolveFrameProjection({ supplied: suppliedProjection, expected: expectedProjection });
  const baseScene = prepareScene(view, projection);
  let cameraScene = applyCameraToScene(baseScene, camera, viewport, limits);
  if (typeof applyFixedGlyph === 'function') cameraScene = applyFixedGlyph(cameraScene);
  return { projection, baseScene, cameraScene };
}
/**
 * Prepare a fit frame for Reset focus against the authoritative base view.
 * The caller must only clear requested/displayed focus after installation.
 */
export function prepareResetFocusFrame({ baseView, ...fitInput }) {
  if (!baseView || typeof baseView !== 'object' || !baseView.staged) {
    throw new GraphRenderError('invalid-reset-focus', 'authoritative base view is required');
  }
  if (baseView.requestedId !== null && baseView.requestedId !== undefined) {
    throw new GraphRenderError('invalid-reset-focus', 'base view must be unfocused');
  }
  return prepareFitFrame({ ...fitInput, view: baseView });
}
