import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { loadTree } from '../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../src/engine/hypertree/layout/index.js';
import { EDITOR_MAX_NODES } from '../../src/engine/hypertree/editor/validation.js';
import { measurePreparedScene } from '../../src/engine/hypertree/layout/experimental-metrics.js';
import { SHAPES, buildFixture, measureTree } from './fixtures.mjs';
import { evaluateStaged, DEFAULT_VIEWPORT } from './evaluate.mjs';
import { measureSceneExact } from './measure.mjs';
import { buildClusterOverview, buildClusterFocus } from './cluster.mjs';

const REPETITIONS = 3;
const viewport = DEFAULT_VIEWPORT;
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; }
function binary(total) {
  const nodes = Array.from({ length: total }, (_, index) => ({ id: index === 0 ? 'root' : `n${index}`, kind: 'file', name: `이진-${index}`, data: {}, children: [] }));
  for (let index = 0; index < total; index += 1) {
    const a = index * 2 + 1; const b = index * 2 + 2;
    if (a < total) { nodes[index].kind = 'folder'; nodes[index].children.push(nodes[a]); }
    if (b < total) { nodes[index].kind = 'folder'; nodes[index].children.push(nodes[b]); }
  }
  return nodes[0];
}
function stageOnce(tree, experimentV2 = {}) {
  const { graph } = loadTree(tree);
  const start = performance.now();
  try {
    const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true }, experimentV2 });
    return { ok: true, ms: performance.now() - start, graph, staged };
  } catch (error) {
    return { ok: false, ms: performance.now() - start, graph, code: error.code || 'unknown', message: error.message, diagnostics: error.diagnostics || null };
  }
}
function summarizeFailure(f) {
  return {
    ok: false, ms: Number(f.ms.toFixed(3)), code: f.code, message: f.message,
    unsatisfied: f.diagnostics?.unsatisfied?.slice(0, 3) || null,
    workspaceScale: f.diagnostics?.workspaceScale ?? null
  };
}
function evaluate(staged, graph, base) {
  const start = performance.now();
  try {
    const result = evaluateStaged(staged, graph, { viewport, projectionBaseRadiusCss: base });
    return { ...result, ms: performance.now() - start };
  } catch (error) {
    return { ok: false, reason: error.code || error.message, ms: performance.now() - start };
  }
}
const report = {
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()?.[0]?.model || 'unavailable',
    logicalCpus: os.cpus()?.length || null,
    browser: 'NOT RUN',
    generatedAt: new Date().toISOString(),
    repetitions: REPETITIONS,
    viewport,
    glyphRadiusCss: 6
  },
  defaults: {
    editorMaxNodes: EDITOR_MAX_NODES,
    v2WorkspaceScaleMax: 16,
    v2ReferenceProjectionRadiusCss: 240,
    diagnosticMaxNodes: 300
  },
  fixtures: {},
  parity: [],
  special: {}
};

for (const shape of SHAPES) {
  report.fixtures[shape] = {};
  for (const total of [300, 1000]) {
    const tree = buildFixture(shape, total);
    const treeStats = measureTree(tree);
    const runs = [];
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const staged = stageOnce(tree);
      if (!staged.ok) { runs.push({ repetition, ...summarizeFailure(staged) }); continue; }
      const evaluation = evaluate(staged.staged, staged.graph, 198.66);
      if (total === 300 && evaluation.ok) {
        const prodStart = performance.now();
        const production = measurePreparedScene(evaluation.scene, { viewport, maxNodes: 300 });
        const productionMs = performance.now() - prodStart;
        const exactStart = performance.now();
        const exact = measureSceneExact(evaluation.scene, { viewport });
        const exactMs = performance.now() - exactStart;
        report.parity.push({
          shape, total,
          production: { overlapPairs: production.overlapPairs, minCenterSeparation: production.minCenterSeparation, bounds: production.bounds, visibleNodes: production.visibleNodes, ms: Number(productionMs.toFixed(3)) },
          exact: { overlapPairs: exact.overlapPairs, minCenterSeparation: exact.minCenterSeparation, bounds: exact.bounds, visibleNodes: exact.visibleNodes, ms: Number(exactMs.toFixed(3)) },
          match: production.overlapPairs === exact.overlapPairs && production.visibleNodes === exact.visibleNodes && production.minCenterSeparation === exact.minCenterSeparation && JSON.stringify(production.bounds) === JSON.stringify(exact.bounds)
        });
      }
      runs.push({
        repetition, ok: true, stageMs: Number(staged.ms.toFixed(3)), workspaceScale: staged.staged.feasibility.workspaceScale,
        evaluation: { ok: evaluation.ok, reason: evaluation.reason || null, ms: Number(evaluation.ms.toFixed(3)), fit: evaluation.fit || null, metrics: evaluation.metrics ? { overlapPairs: evaluation.metrics.overlapPairs, minCenterSeparation: evaluation.metrics.minCenterSeparation, visibleNodes: evaluation.metrics.visibleNodes, totalNodes: evaluation.metrics.totalNodes, edges: evaluation.edgeCount ?? null, bounds: evaluation.metrics.bounds } : null }
      });
    }
    report.fixtures[shape][total] = { descriptor: `${shape}-${total}`, actual: treeStats, runs };
  }
}

// Special 1,000-node binary: stage and explicit opt-in refinement diagnostics.
{
  const tree = binary(1000);
  const stats = measureTree(tree);
  const runs = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const staged = stageOnce(tree);
    if (!staged.ok) { runs.push({ repetition, ...summarizeFailure(staged) }); continue; }
    const refineStart = performance.now();
    let refinement = null; let refinementError = null;
    try {
      refinement = refineExperimentalV2Layout(staged.staged, staged.graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, diagnosticMaxNodes: 1000 });
    } catch (error) { refinementError = { code: error.code || 'unknown', message: error.message }; }
    const refineMs = performance.now() - refineStart;
    const evaluation = refinement ? evaluate(refinement.staged, staged.graph, 198.66) : null;
    runs.push({
      repetition, ok: true, stageMs: Number(staged.ms.toFixed(3)), workspaceScale: staged.staged.feasibility.workspaceScale,
      refineMs: Number(refineMs.toFixed(3)), refinement: refinement ? { applied: refinement.refinement.applied, attempts: refinement.refinement.attempts, beforeOverlap: refinement.refinement.before?.overlapPairs ?? null, afterOverlap: refinement.refinement.after?.overlapPairs ?? null } : null,
      refinementError,
      evaluation: evaluation ? { ok: evaluation.ok, metrics: evaluation.metrics ? { overlapPairs: evaluation.metrics.overlapPairs, visibleNodes: evaluation.metrics.visibleNodes, edges: evaluation.edgeCount ?? null } : null, fit: evaluation.fit || null } : null
    });
  }
  report.special.binary1000 = { actual: stats, runs };
}

// Exact broad-phase versus production pairwise diagnostics at 1,000 nodes.
{
  const tree = binary(1000);
  const aggregatedStage = stageOnce(tree);
  const refined = aggregatedStage.ok ? refineExperimentalV2Layout(aggregatedStage.staged, aggregatedStage.graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, diagnosticMaxNodes: 1000 }) : null;
  const evaluation = refined ? evaluate(refined.staged, aggregatedStage.graph, 198.66) : null;
  report.special.diagnostic1000 = { runs: [] };
  if (evaluation?.ok) {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const prodStart = performance.now();
      const production = measurePreparedScene(evaluation.scene, { viewport, maxNodes: 1000 });
      const productionMs = performance.now() - prodStart;
      const exactStart = performance.now();
      const exact = measureSceneExact(evaluation.scene, { viewport });
      const exactMs = performance.now() - exactStart;
      report.special.diagnostic1000.runs.push({
        repetition,
        production: { overlapPairs: production.overlapPairs, minCenterSeparation: production.minCenterSeparation, ms: Number(productionMs.toFixed(3)) },
        exact: { overlapPairs: exact.overlapPairs, minCenterSeparation: exact.minCenterSeparation, ms: Number(exactMs.toFixed(3)) },
        match: production.overlapPairs === exact.overlapPairs && production.minCenterSeparation === exact.minCenterSeparation
      });
    }
  }
}

// Capacity probe: flat 1,000 with a larger reference projection radius only.
{
  const tree = buildFixture('flat', 1000);
  const runs = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const staged = stageOnce(tree, { referenceProjectionRadiusCss: 960 });
    if (!staged.ok) { runs.push({ repetition, ...summarizeFailure(staged) }); continue; }
    const evaluation = evaluate(staged.staged, staged.graph, 960);
    runs.push({ repetition, ok: true, stageMs: Number(staged.ms.toFixed(3)), workspaceScale: staged.staged.feasibility.workspaceScale, evaluation: { ok: evaluation.ok, fit: evaluation.fit || null, metrics: evaluation.metrics ? { overlapPairs: evaluation.metrics.overlapPairs, minCenterSeparation: evaluation.metrics.minCenterSeparation, visibleNodes: evaluation.metrics.visibleNodes, edges: evaluation.edgeCount ?? null } : null } });
  }
  report.special.flat1000Reference960 = { actual: measureTree(tree), runs };
}

// Cluster/focus presentation: overview and one expanded cluster.
{
  const tree = buildFixture('flat', 1000);
  const overview = buildClusterOverview(tree, { clusterSize: 40 });
  const focus = buildClusterFocus(tree, 0, { clusterSize: 40 });
  const stageEval = (presentation) => {
    const staged = stageOnce(presentation.tree);
    if (!staged.ok) return summarizeFailure(staged);
    const evaluation = evaluate(staged.staged, staged.graph, 198.66);
    return { ok: true, actual: measureTree(presentation.tree), stageMs: Number(staged.ms.toFixed(3)), evaluation: { ok: evaluation.ok, fit: evaluation.fit || null, metrics: evaluation.metrics ? { overlapPairs: evaluation.metrics.overlapPairs, visibleNodes: evaluation.metrics.visibleNodes, totalNodes: evaluation.metrics.totalNodes, edges: evaluation.edgeCount ?? null } : null } };
  };
  report.special.cluster1000 = {
    overview: { clusters: overview.clusterCount, result: stageEval(overview) },
    focused: { clusters: focus.clusterCount, focusedIndex: focus.focusedClusterIndex, result: stageEval(focus) }
  };
}

const file = new URL('./results.json', import.meta.url);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  environment: report.environment,
  fixtures: Object.fromEntries(Object.entries(report.fixtures).map(([shape, byTotal]) => [shape, Object.fromEntries(Object.entries(byTotal).map(([total, value]) => [total, { actual: value.actual, last: value.runs.at(-1) }]))])),
  parity: report.parity,
  special: report.special
}, null, 2));
