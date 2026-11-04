import { applyFixedGlyphPolicy } from '../layout/index.js';
import { createProjection, prepareGraphScene } from '../render/index.js';
import { createHitSnapshot } from '../interaction/index.js';
import { applyCameraToScene, createCamera, normalizeCameraLimits } from '../navigation/index.js';
import { buildFilteredViewLayout } from './navigation-model.js';
import { buildExplorationPresentation } from './presentation.js';

export const CONTAINMENT_TOLERANCE_CSS = 1e-6;
export const CENTER_TOLERANCE_CSS = 1e-6;

/** Build and validate the scene/hit pair for one exploration view. */
export function prepareExplorationFrame({
  graph,
  baseLayout,
  view,
  viewport,
  baseRadiusCss,
  fit = false,
  entry = null,
  camera = null,
  framing = 'manual',
  cameraLimits,
  padding = 24,
  focusedStaged = null,
  presentation = undefined,
  nodeOpacity = undefined,
  explorationPresentation = null
}) {
  const resolvedPresentation = explorationPresentation || buildExplorationPresentation({ baseLayout, graph });
  const filtered = buildFilteredViewLayout({ baseLayout, view, focusedStaged });
  const projection = createProjection({
    width: viewport.width,
    height: viewport.height,
    radius: baseRadiusCss * baseLayout.feasibility.workspaceScale
  });
  const dims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const baseScene = prepareGraphScene(filtered, { phase: view.phase, projection, nodeDims: dims, nodeKinds: kinds, presentation: presentation || resolvedPresentation.presentation, nodeOpacity });
  const fitBase = applyFixedGlyphPolicy(baseScene, { radii: resolvedPresentation.radii, styles: resolvedPresentation.styles });
  let nextCamera = camera;
  let nextFraming = framing;
  let fitInfo = null;
  if (fit) {
    fitInfo = centeredFit(fitBase, view, viewport, padding, cameraLimits);
    nextCamera = fitInfo.camera;
    nextFraming = 'fit';
  } else if (entry?.camera && entry.framingMode === 'manual') {
    nextCamera = createCamera(entry.camera, cameraLimits);
    nextFraming = 'manual';
  }
  if (!nextCamera) throw new Error('camera is required for manual frame');
  const cameraScene = applyCameraToScene(fitBase, nextCamera, viewport, cameraLimits);
  const finalScene = applyFixedGlyphPolicy(cameraScene, { radii: resolvedPresentation.radii, styles: resolvedPresentation.styles });
  const focused = finalScene.nodes.get(view.focusedFolderId);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const centerError = focused ? Math.hypot(focused.center.x - center.x, focused.center.y - center.y) : null;
  const containedCount = [...finalScene.nodes.values()].filter((node) => withinPadding(node, viewport, padding, CONTAINMENT_TOLERANCE_CSS)).length;
  const containment = {
    contained: containedCount === finalScene.nodes.size,
    containedCount,
    totalCount: finalScene.nodes.size,
    centeredId: view.focusedFolderId,
    centerError,
    centerToleranceCss: CENTER_TOLERANCE_CSS,
    paddingToleranceCss: CONTAINMENT_TOLERANCE_CSS
  };
  if (fit && (!containment.contained || centerError > containment.centerToleranceCss)) {
    throw new Error(`centered-fit-infeasible: contained ${containedCount}/${finalScene.nodes.size}, center ${centerError}`);
  }
  const hit = createHitSnapshot(finalScene);
  return { filtered, projection, baseScene: fitBase, scene: finalScene, camera: nextCamera, framing: nextFraming, hit, fit, fitInfo, containment };
}
/** Execute the shared draw/label/hit installation order after frame preparation. */
export function stageExplorationFrame(options) {
  const prepared = prepareExplorationFrame(options);
  const adapters = options.adapters || {};
  if (typeof adapters.draw !== 'function') throw new Error('draw adapter is required');
  if (typeof adapters.labels !== 'function') throw new Error('label adapter is required');
  if (typeof adapters.installHit !== 'function') throw new Error('hit adapter is required');
  adapters.draw(prepared.scene);
  adapters.labels(prepared.scene);
  adapters.installHit(prepared.hit);
  return prepared;
}
function centeredFit(scene, view, viewport, padding, cameraLimits) {
  const limits = normalizeCameraLimits(cameraLimits);
  const halfW = viewport.width / 2 - padding;
  const halfH = viewport.height / 2 - padding;
  if (halfW <= 0 || halfH <= 0) throw new Error('centered-fit-infeasible: viewport too small');
  let zoom = limits.maxZoom;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  for (const node of scene.nodes.values()) {
    if (node.radius > halfW || node.radius > halfH) throw new Error('centered-fit-infeasible: node exceeds viewport');
    const dx = Math.abs(node.center.x - cx);
    const dy = Math.abs(node.center.y - cy);
    if (dx > 0) zoom = Math.min(zoom, (halfW - node.radius) / dx);
    if (dy > 0) zoom = Math.min(zoom, (halfH - node.radius) / dy);
  }
  if (!Number.isFinite(zoom) || zoom < limits.minZoom) {
    throw new Error(`centered-fit-infeasible: required zoom ${zoom}`);
  }
  return {
    camera: { zoom, panX: 0, panY: 0 },
    zoom,
    focusedFolderId: view.focusedFolderId,
    limits: limits.minZoom,
    maxZoom: limits.maxZoom
  };
}

export function withinPadding(node, viewport, padding, tolerance = CONTAINMENT_TOLERANCE_CSS) {
  return node.center.x - node.radius >= padding - tolerance
    && node.center.y - node.radius >= padding - tolerance
    && node.center.x + node.radius <= viewport.width - padding + tolerance
    && node.center.y + node.radius <= viewport.height - padding + tolerance;
}









