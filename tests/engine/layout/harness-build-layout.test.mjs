import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  refineExperimentalV2Crowding,
  refineExperimentalV2LocalCrowding
} from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { buildLayoutPlan } from '../../harness/m5-adaptive-layout/layout-builder.mjs';
import { f20 } from './fixtures.mjs';

const base = {
  tree: f20(),
  config: { bandCount: 2, minStep: 0.01 },
  phases: ['current', 'start', 'end'],
  viewport: { width: 1100, height: 473 },
  baseRadiusCss: 198.66,
  phase: 'current'
};

test('baseline and v1 return null refinement/crowding and initialize a scene', () => {
  for (const mode of ['baseline', 'v1']) {
    const plan = buildLayoutPlan({ ...base, mode, refine: true, crowd: true });
    assert.equal(plan.refinement, null);
    assert.equal(plan.crowding, null);
    assert.ok(plan.staged.nodes.size > 0);
    const projection = createProjection({ width: 1100, height: 473, radius: 198.66 });
    const dims = new Map([...plan.graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
    const kinds = new Map([...plan.graph.nodes].map(([id, n]) => [id, n.kind]));
    const scene = prepareGraphScene(plan.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
    assert.equal(scene.nodeCount, 20);
  }
});

test('v2 independent controls: neither, refinement only, crowding only, both', () => {
  const neither = buildLayoutPlan({ ...base, mode: 'v2' });
  assert.equal(neither.refinement, null);
  assert.equal(neither.crowding, null);

  const refineOnly = buildLayoutPlan({ ...base, mode: 'v2', refine: true });
  assert.ok(refineOnly.refinement);
  assert.equal(refineOnly.crowding, null);
  assert.equal(refineOnly.refinement.applied, true);

  const crowdOnly = buildLayoutPlan({ ...base, mode: 'v2', crowd: true });
  assert.equal(crowdOnly.refinement, null);
  assert.ok(crowdOnly.crowding);
  assert.ok(['accepted', 'no-crowding', 'no-improving-candidate'].includes(crowdOnly.crowding.outcome));

  const localOnly = buildLayoutPlan({ ...base, mode: 'v2', correction: 'local' });
  assert.equal(localOnly.refinement, null);
  assert.ok(localOnly.crowding);
  assert.equal(localOnly.correctionMode, 'local');

  const calls = [];
  const both = buildLayoutPlan({
    ...base,
    mode: 'v2',
    refine: true,
    correction: 'global',
    implementations: {
      stageV2: (graph, options) => { calls.push('v2'); return stageExperimentalV2Layout(graph, options); },
      refine: (staged, graph, options) => { calls.push('refine'); return refineExperimentalV2Layout(staged, graph, options); },
      crowd: (staged, graph, options) => { calls.push('crowd'); return refineExperimentalV2Crowding(staged, graph, options); }
    }
  });
  assert.deepEqual(calls, ['v2', 'refine', 'crowd']);
  assert.ok(both.refinement);
  assert.ok(both.crowding);
  assert.equal(both.refinement.applied, true);
  assert.ok(['accepted', 'no-crowding', 'no-improving-candidate'].includes(both.crowding.outcome));
});

test('buildLayoutPlan baseline creation has no missing crowding binding', () => {
  const plan = buildLayoutPlan({ ...base, mode: 'baseline' });
  assert.equal(plan.refinement, null);
  assert.equal(plan.crowding, null);
  assert.doesNotThrow(() => {
    const projection = createProjection({ width: 1100, height: 473, radius: 198.66 });
    const dims = new Map([...plan.graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
    const kinds = new Map([...plan.graph.nodes].map(([id, n]) => [id, n.kind]));
    prepareGraphScene(plan.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  });
});
test('local correction is independent and never composed with global', () => {
  const calls = [];
  const local = buildLayoutPlan({
    ...base,
    mode: 'v2',
    refine: true,
    correction: 'local',
    implementations: {
      stageV2: (graph, options) => { calls.push('v2'); return stageExperimentalV2Layout(graph, options); },
      refine: (staged, graph, options) => { calls.push('refine'); return refineExperimentalV2Layout(staged, graph, options); },
      crowd: () => { calls.push('global'); throw new Error('global must not run'); },
      localCrowd: (staged, graph, options) => { calls.push('local'); return refineExperimentalV2LocalCrowding(staged, graph, options); }
    }
  });
  assert.deepEqual(calls, ['v2', 'refine', 'local']);
  assert.equal(local.correctionMode, 'local');
  assert.ok(local.crowding);
});


