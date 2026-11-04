import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageExperimentalV2Layout,
  refineExperimentalV2Layout,
  REFINEMENT_MAX_CANDIDATES,
  applyFixedGlyphPolicy,
  shapeBoundarySeparation,
  minimumShapeBoundarySeparation
} from '../../../src/engine/hypertree/layout/index.js';
import {
  EXPERIMENTAL_CAMERA_LIMITS,
  applyCameraToScene,
  calculateFitCamera
} from '../../../src/engine/hypertree/navigation/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode, createSelectionController, installSelectionFrame } from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, longLabels } from './crowding-fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const options = { viewport, padding: 24, projectionBaseRadiusCss: 198.66 };

function run(make) {
  const tree = make();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, {
    rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true }
  });
  const refined = refineExperimentalV2Layout(base, graph, options);
  return { tree, graph, base, refined };
}

test('refinement is deterministic and bounded', () => {
  const a = run(f200);
  const b = run(f200);
  assert.equal(a.refined.refinement.outcome, b.refined.refinement.outcome);
  assert.equal(a.refined.refinement.selectedPattern, b.refined.refinement.selectedPattern);
  assert.deepEqual([...a.refined.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]),
    [...b.refined.staged.nodes].map(([id, n]) => [id, n.positions.get('current')]));
  for (const fixture of [a, b]) {
    assert.ok(fixture.refined.refinement.attempts <= REFINEMENT_MAX_CANDIDATES);
    assert.equal(fixture.refined.refinement.candidateLimit, REFINEMENT_MAX_CANDIDATES);
  }
});

test('accepted refinement preserves IDs, topology, sibling order, depths, phases, counts', () => {
  const { refined } = run(f20);
  assert.equal(refined.refinement.applied, true);
  const { base } = run(f20);
  assert.equal(refined.staged.nodeCount, base.nodeCount);
  assert.deepEqual([...refined.staged.children].map(([id, ids]) => [id, ids]),
    [...base.children].map(([id, ids]) => [id, ids]));
  for (const [id, node] of refined.staged.nodes) {
    assert.equal(node.depth, base.nodes.get(id).depth);
    assert.equal(node.positions.size, base.nodes.get(id).positions.size);
    assert.ok(node.positions.get('current').rho < 1);
  }
  assert.equal(refined.staged.rootId, base.rootId);
});

test('accepted candidate is independently owned and leaves original v2 unchanged', () => {
  const { base, refined } = run(f20);
  const before = [...base.nodes].map(([id, n]) => [id, n.positions.get('current').rho]);
  assert.equal(refined.refinement.applied, true);
  assert.notEqual(refined.staged, base);
  assert.notEqual(refined.staged.nodes.get('n1'), base.nodes.get('n1'));
  refined.staged.nodes.get('n1').positions.get('current').rho = 0.999;
  assert.deepEqual([...base.nodes].map(([id, n]) => [id, n.positions.get('current').rho]), before);
});

test('non-improving fixture returns the original v2 candidate with reason', () => {
  const { base, refined } = run(crowdedFolder);
  assert.equal(refined.refinement.applied, false);
  assert.equal(refined.refinement.outcome, 'no-improving-candidate');
  assert.equal(refined.staged, base);
  assert.deepEqual(refined.refinement.before, refined.refinement.after);
});

test('all compared fixtures preserve nodes and remain contained after final fit', () => {
  for (const make of [f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels]) {
    const { graph, refined } = run(make);
    const staged = refined.staged;
    const projection = createProjection({
      ...viewport, radius: 198.66 * staged.feasibility.workspaceScale
    });
    const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
    const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
    const base = prepareGraphScene(staged, { phase: staged.firstPhase, projection, nodeDims: dims, nodeKinds: kinds });
    const fixed = applyFixedGlyphPolicy(base);
    const fit = calculateFitCamera({
      nodes: [...fixed.nodes.values()], viewport, padding: 24,
      presentation: { kind: 'fixed', glyphRadiusCss: 6 },
      projectionScale: staged.feasibility.workspaceScale,
      limits: EXPERIMENTAL_CAMERA_LIMITS
    });
    assert.equal(fit.ok, true);
    assert.equal(fit.containedCount, fit.eligibleCount);
    assert.equal(fit.clippedCount, 0);
    const final = applyFixedGlyphPolicy(applyCameraToScene(fixed, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
    for (const node of final.nodes.values()) {
      assert.equal(node.radius, 6);
      assert.ok(node.center.x - 6 >= 24 - 1e-6);
      assert.ok(node.center.y - 6 >= 24 - 1e-6);
      assert.ok(node.center.x + 6 <= viewport.width - 24 + 1e-6);
      assert.ok(node.center.y + 6 <= viewport.height - 24 + 1e-6);
    }
    assert.equal(final.nodes.size, staged.nodeCount);
  }
});

test('refined final scene installs matching hit geometry', () => {
  const { graph, refined } = run(f200);
  const staged = refined.staged;
  const projection = createProjection({ ...viewport, radius: 198.66 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const fixed = applyFixedGlyphPolicy(prepareGraphScene(staged, { phase: staged.firstPhase, projection, nodeDims: dims, nodeKinds: kinds }));
  const fit = calculateFitCamera({
    nodes: [...fixed.nodes.values()], viewport, padding: 24,
    presentation: { kind: 'fixed', glyphRadiusCss: 6 },
    projectionScale: staged.feasibility.workspaceScale, limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  const final = applyFixedGlyphPolicy(applyCameraToScene(fixed, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
  const snap = createHitSnapshot(final);
  const target = final.nodes.get('n13');
  assert.equal(hitTestNode(snap, target.center), 'n13');
  const listeners = new Map();
  const canvas = {
    ownerDocument: null, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1100, height: 473 }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {}
  };
  const controller = createSelectionController(canvas);
  const install = installSelectionFrame(controller, {
    scene: final, generation: 11, selectedId: 'n13',
    draw: () => ({ drawResult: { drawnNodes: 200, drawnEdges: 199, selectionDrawn: true }, labels: {} })
  });
  assert.equal(controller.getState().selectedId, 'n13');
  assert.equal(controller.getState().generation, 11);
  assert.equal(install.state.selectedId, 'n13');
  controller.destroy();
});
test('shape-aware boundary separation handles circles and diamonds exactly at the sign boundary', () => {
  const circle = (x, r = 5) => ({ shape: 'circle', center: { x, y: 0 }, radius: r });
  const diamond = (x, r = 5) => ({ shape: 'diamond', center: { x, y: 0 }, radius: r });
  assert.equal(shapeBoundarySeparation(circle(0), circle(8)), -2);
  assert.equal(shapeBoundarySeparation(circle(0), circle(10)), 0);
  assert.equal(shapeBoundarySeparation(diamond(0), diamond(10)), 0);
  assert.equal(shapeBoundarySeparation(circle(0), diamond(10)), 0);
  assert.equal(shapeBoundarySeparation(circle(0), diamond(8)), -2);
  assert.ok(shapeBoundarySeparation(diamond(0), diamond(6)) < 0);
  const nodes = [{ ...circle(0), id: 'a', visible: true }, { ...diamond(10), id: 'b', visible: true }];
  assert.equal(minimumShapeBoundarySeparation(nodes), 0);
});

test('phase option defaults to firstPhase and accepts end/start selected phases', () => {
  for (const phases of [['end'], ['start'], ['current', 'end']]) {
    const tree = f20();
    const { graph } = loadTree(tree);
    const base = stageExperimentalV2Layout(graph, { rootId: 'n0', phases, nodeOptions: { overridable: true } });
    for (const phase of phases) {
      const refined = refineExperimentalV2Layout(base, graph, {
        viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase
      });
      assert.equal(refined.refinement.phase, phase);
      assert.ok(refined.refinement.before.totalNodes === 20);
    }
  }
  const tree = f20();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['end'], nodeOptions: { overridable: true } });
  const defaultPhase = refineExperimentalV2Layout(base, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66 });
  assert.equal(defaultPhase.refinement.phase, 'end');
});

test('invalid phase is rejected without mutation', () => {
  const { graph } = loadTree(f20());
  const base = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const snapshot = [...base.nodes].map(([id, n]) => [id, n.positions.get('current').rho]);
  assert.throws(
    () => refineExperimentalV2Layout(base, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'end' }),
    (error) => error.code === 'invalid-phase'
  );
  assert.deepEqual([...base.nodes].map(([id, n]) => [id, n.positions.get('current').rho]), snapshot);
});

test('accepted output independently owns phases, experiment config, feasibility, nodes, and maps', () => {
  const a = run(f20);
  const b = run(f20);
  const accepted = a.refined.staged;
  assert.equal(a.refined.refinement.applied, true);
  assert.notEqual(accepted.phases, a.base.phases);
  assert.notEqual(accepted.experiment, a.base.experiment);
  assert.notEqual(accepted.experiment.config, a.base.experiment.config);
  assert.notEqual(accepted.feasibility, a.base.feasibility);
  assert.notEqual(accepted.nodes.get('n1'), a.base.nodes.get('n1'));
  assert.notEqual(accepted.radialById, a.base.radialById);
  accepted.phases.push('mutated');
  accepted.experiment.config.bandCount = 99;
  accepted.feasibility.satisfied = false;
  accepted.feasibility.unsatisfied.push({ parentId: 'mutated' });
  accepted.nodes.get('n1').positions.get('current').rho = 0.5;
  accepted.radialById.set('n1', 0.5);
  assert.equal(a.base.phases.includes('mutated'), false);
  assert.notEqual(a.base.experiment.config.bandCount, 99);
  assert.equal(a.base.feasibility.satisfied, true);
  assert.deepEqual(a.base.feasibility.unsatisfied, []);
  assert.notEqual(a.base.nodes.get('n1').positions.get('current').rho, 0.5);
  assert.equal(b.refined.staged.nodes.get('n1').positions.get('current').rho === 0.5, false);
});
test('signed diamond penetration is normalized CSS-pixel minimum translation', () => {
  const d = (x, y, r) => ({ shape: 'diamond', center: { x, y }, radius: r });
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-9, `${actual} != ${expected}`);
  near(shapeBoundarySeparation(d(0, 0, 3), d(0, 0, 3)), -3 * Math.SQRT2);
  near(shapeBoundarySeparation(d(0, 0, 6), d(0, 0, 6)), -6 * Math.SQRT2);
  near(shapeBoundarySeparation(d(0, 0, 6), d(1, 1, 3)), -(9 - 2) / Math.SQRT2);
  near(shapeBoundarySeparation(d(0, 0, 3), d(2, 0, 3)), -(6 - 2) / Math.SQRT2);
  near(shapeBoundarySeparation(d(0, 0, 5), d(10, 0, 5)), 0);
  near(shapeBoundarySeparation(d(0, 0, 5), d(12, 0, 5)), 2);
  near(shapeBoundarySeparation(d(4, 5, 3), d(6, 5, 3)), shapeBoundarySeparation(d(6, 5, 3), d(4, 5, 3)));
  near(shapeBoundarySeparation(d(100, -50, 3), d(102, -50, 3)), shapeBoundarySeparation(d(0, 0, 3), d(2, 0, 3)));
  const k = 7.5;
  near(shapeBoundarySeparation(d(0, 0, 3 * k), d(2 * k, 0, 3 * k)), k * shapeBoundarySeparation(d(0, 0, 3), d(2, 0, 3)));
});

