/**
 * Node-only primary/secondary report for baseline / v1 / v2.
 * Primary: projection 240, workspaceScale=1 for all modes.
 * Secondary: v2-selected scale applied equally to all modes.
 * Labels are NOT MEASURED here; use the browser harness for DOM labels.
 */
import { performance } from 'node:perf_hooks';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageRadialLayout,
  stageExperimentalLayout,
  stageExperimentalV2Layout,
  applyFixedGlyphPolicy,
  comparePreparedScenes,
  measurePreparedScene,
  radialSpread
} from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { f20, f200 } from './fixtures.mjs';
import {
  crowdedFolder,
  denseNeighbors,
  mixedDeepWide,
  longLabels,
  infeasibleDepth
} from './crowding-fixtures.mjs';

const fixtures = { f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels };
const viewport = { width: 800, height: 600 };
const referenceProjectionRadius = 240;

function build(tree, mode, v2Options) {
  const { graph } = loadTree(tree);
  const start = performance.now();
  let staged;
  if (mode === 'baseline') {
    staged = stageRadialLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  } else if (mode === 'v1') {
    staged = stageExperimentalLayout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  } else {
    staged = stageExperimentalV2Layout(graph, {
      rootId: tree.id,
      phases: ['current'],
      nodeOptions: { overridable: true },
      experimentV2: {
        referenceProjectionRadiusCss: referenceProjectionRadius,
        ...(v2Options || {})
      }
    });
  }
  return { graph, staged, layoutMs: performance.now() - start };
}

function sceneFor(built, projectionRadius) {
  const projection = createProjection({ ...viewport, radius: projectionRadius });
  const dims = new Map([...built.graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const kinds = new Map([...built.graph.nodes].map(([id, node]) => [id, node.kind]));
  const scene = prepareGraphScene(built.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  return applyFixedGlyphPolicy(scene);
}

function entry(built, projectionRadius) {
  const scene = sceneFor(built, projectionRadius);
  const metrics = measurePreparedScene(scene, { viewport });
  const radial = radialSpread(built.staged, 'current');
  return {
    layoutMs: built.layoutMs,
    metrics,
    fixedSizeDiagnostic: { radiusCss: 6, overlapPairs: metrics.overlapPairs, provenance: 'fixed presentation radius is the rendered radius' },
    radialSpread: Object.fromEntries(radial),
    boundaryClearance: 1 - Math.max(...[...radial.values()].map((value) => value.max)),
    feasibility: built.staged.feasibility || null
  };
}

function comparisonSection(tree, scale) {
  const projectionRadius = referenceProjectionRadius * scale;
  const modes = {};
  for (const mode of ['baseline', 'v1']) {
    modes[mode] = entry(build(tree, mode), projectionRadius);
  }
  let v2;
  let v2Error = null;
  try {
    v2 = build(tree, 'v2', { workspaceScaleMin: scale, workspaceScaleMax: scale, workspaceScaleStep: 1 });
    modes.v2 = entry(v2, projectionRadius);
  } catch (error) {
    v2Error = { name: error.name, code: error.code, message: error.message, diagnostics: error.diagnostics || null };
  }
  const scenes = {};
  if (modes.baseline) scenes.baseline = sceneFor(build(tree, 'baseline'), projectionRadius);
  if (modes.v2) scenes.v2 = sceneFor(v2, projectionRadius);
  return {
    workspaceScale: scale,
    projection: {
      calculationRadiusCss: referenceProjectionRadius,
      displayedRadiusCss: projectionRadius,
      cameraZoom: 1
    },
    modes,
    v2Error,
    baselineVsV2: scenes.baseline && scenes.v2 ? comparePreparedScenes(scenes.baseline, scenes.v2, { viewport }) : null,
    labelMetrics: 'NOT MEASURED (Node report); use m5-adaptive-layout browser harness'
  };
}

const report = {};
for (const [name, make] of Object.entries(fixtures)) {
  const primary = comparisonSection(make(), 1);
  let secondary;
  try {
    const v2 = build(make(), 'v2');
    secondary = comparisonSection(make(), v2.staged.feasibility.workspaceScale);
  } catch (error) {
    secondary = { error: { code: error.code, message: error.message, diagnostics: error.diagnostics || null } };
  }
  report[name] = {
    primary,
    secondary,
    presentation: { fixedGlyphRadiusCss: 6, viewport, dpr: 'reference-only' }
  };
}
try {
  const graph = loadTree(infeasibleDepth()).graph;
  stageExperimentalV2Layout(graph, { rootId: 'depth-0', phases: ['current'], experimentV2: { minStep: 0.02 } });
  report.infeasible = { rejected: false };
} catch (error) {
  report.infeasible = { rejected: true, code: error.code, message: error.message, diagnostics: error.diagnostics || null };
}
console.log(JSON.stringify(report, null, 2));
