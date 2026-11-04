import { createProjection } from '../../src/engine/hypertree/render/coordinates.js';
import { prepareGraphScene } from '../../src/engine/hypertree/render/scene.js';
import { calculateFitCamera } from '../../src/engine/hypertree/navigation/fit.js';
import { applyCameraToScene } from '../../src/engine/hypertree/navigation/camera-scene.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../src/engine/hypertree/navigation/camera.js';
import { applyFixedGlyphPolicy } from '../../src/engine/hypertree/layout/experimental-v2-presentation.js';
import { measureSceneExact } from './measure.mjs';

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1600, height: 900 });
export const DEFAULT_GLYPH_RADIUS_CSS = 6;

export function evaluateStaged(staged, graph, options = {}) {
  const viewport = options.viewport || DEFAULT_VIEWPORT;
  const glyphRadiusCss = options.glyphRadiusCss || DEFAULT_GLYPH_RADIUS_CSS;
  const projectionBaseRadiusCss = options.projectionBaseRadiusCss || 198.66;
  const phase = options.phase || staged.firstPhase;
  const workspaceScale = staged.feasibility.workspaceScale;
  if (!Number.isFinite(workspaceScale) || workspaceScale <= 0) return { ok: false, reason: 'invalid-workspace-scale' };
  const projection = createProjection({ ...viewport, radius: projectionBaseRadiusCss * workspaceScale });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const baseScene = prepareGraphScene(staged, { phase, projection, nodeDims, nodeKinds });
  const fixedBase = applyFixedGlyphPolicy(baseScene, { radius: glyphRadiusCss });
  const fit = calculateFitCamera({
    nodes: [...fixedBase.nodes.values()],
    viewport,
    padding: options.padding === undefined ? 24 : options.padding,
    presentation: { kind: 'fixed', glyphRadiusCss },
    projectionScale: workspaceScale,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  if (!fit.ok) return { ok: false, reason: fit.reason || 'fit-failed', fit };
  const cameraScene = applyCameraToScene(fixedBase, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  const finalScene = applyFixedGlyphPolicy(cameraScene, { radius: glyphRadiusCss });
  const metrics = measureSceneExact(finalScene, { viewport });
  return {
    ok: true,
    scene: finalScene,
    edgeCount: finalScene.edgeCount ?? finalScene.edges?.length ?? 0,
    metrics,
    fit: {
      ok: fit.ok,
      zoom: fit.appliedZoom,
      eligibleCount: fit.eligibleCount,
      containedCount: fit.containedCount,
      clippedCount: fit.clippedCount
    },
    workspaceScale,
    glyphRadiusCss,
    projectionBaseRadiusCss
  };
}

