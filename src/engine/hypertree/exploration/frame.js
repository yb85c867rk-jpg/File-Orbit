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
  fitSubtree = false,
  labelBudget = null,
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
  const activeFitIds = fitSubtree && view.focusedFolderId !== view.structuralRootId ? new Set([...view.ancestorIds, ...view.descendantIds]) : null;
  let fitIds = activeFitIds;
  if (fit) {
    if (fitSubtree === 'adaptive' && activeFitIds && (!labelBudget || fitBase.nodes.size <= labelBudget)) {
      try {
        fitIds = null;
        fitInfo = centeredFit(fitBase, view, viewport, padding, cameraLimits, null);
      } catch {
        fitIds = activeFitIds;
        fitInfo = centeredFit(fitBase, view, viewport, padding, cameraLimits, fitIds);
      }
    } else {
      fitInfo = centeredFit(fitBase, view, viewport, padding, cameraLimits, fitIds);
    }
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
  const centerError = fitIds ? null : (focused ? Math.hypot(focused.center.x - center.x, focused.center.y - center.y) : null);
  const containedCount = [...finalScene.nodes.values()].filter((node) => (!fitIds || fitIds.has(node.id)) && withinPadding(node, viewport, padding, CONTAINMENT_TOLERANCE_CSS)).length;
  const containedTotal = fitIds ? fitIds.size : finalScene.nodes.size;
  const containment = {
    contained: containedCount === containedTotal,
    containedCount,
    totalCount: containedTotal,
    scope: fitIds ? 'active-branch' : 'all-visible',
    centeredId: view.focusedFolderId,
    centerError,
    centerToleranceCss: CENTER_TOLERANCE_CSS,
    paddingToleranceCss: CONTAINMENT_TOLERANCE_CSS
  };
  if (fit && (!containment.contained || (fitSubtree !== 'adaptive' && !fitIds && centerError > containment.centerToleranceCss))) {
    throw new Error(`centered-fit-infeasible: contained ${containedCount}/${containedTotal}, center ${centerError}`);
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
function centeredFit(scene, view, viewport, padding, cameraLimits, fitIds = null) {
  const limits = normalizeCameraLimits(cameraLimits);
  const halfW = viewport.width / 2 - padding;
  const halfH = viewport.height / 2 - padding;
  if (halfW <= 0 || halfH <= 0) throw new Error('centered-fit-infeasible: viewport too small');
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  let zoom = limits.maxZoom;
  let panX = 0;
  let panY = 0;
  if (fitIds && fitIds.size > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of scene.nodes.values()) {
      if (!fitIds.has(node.id)) continue;
      minX = Math.min(minX, node.center.x - node.radius);
      maxX = Math.max(maxX, node.center.x + node.radius);
      minY = Math.min(minY, node.center.y - node.radius);
      maxY = Math.max(maxY, node.center.y + node.radius);
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) throw new Error('centered-fit-infeasible: active branch bounds');
    const spanX = (maxX - minX) / 2;
    const spanY = (maxY - minY) / 2;
    zoom = Math.min(limits.maxZoom, (halfW - 16) / spanX, (halfH - 16) / spanY);
    const bx = (minX + maxX) / 2;
    const by = (minY + maxY) / 2;
    panX = -zoom * (bx - cx);
    panY = -zoom * (by - cy);
  } else {
    for (const node of scene.nodes.values()) {
      if (node.radius > halfW || node.radius > halfH) throw new Error('centered-fit-infeasible: node exceeds viewport');
      const dx = Math.abs(node.center.x - cx);
      const dy = Math.abs(node.center.y - cy);
      if (dx > 0) zoom = Math.min(zoom, (halfW - node.radius) / dx);
      if (dy > 0) zoom = Math.min(zoom, (halfH - node.radius) / dy);
    }
  }
  if (!Number.isFinite(zoom) || zoom < limits.minZoom) throw new Error('centered-fit-infeasible: required zoom ' + zoom);
  return { camera: { zoom, panX, panY }, zoom, focusedFolderId: view.focusedFolderId, limits: limits.minZoom, maxZoom: limits.maxZoom, scope: fitIds ? 'active-branch' : 'all-visible' };
}
export function withinPadding(node, viewport, padding, tolerance = CONTAINMENT_TOLERANCE_CSS) {
  return node.center.x - node.radius >= padding - tolerance
    && node.center.y - node.radius >= padding - tolerance
    && node.center.x + node.radius <= viewport.width - padding + tolerance
    && node.center.y + node.radius <= viewport.height - padding + tolerance;
}









