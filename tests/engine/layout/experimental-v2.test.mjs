import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  stageRadialLayout,
  stageExperimentalLayout,
  stageExperimentalV2Layout,
  V2_MAX_SCALE_ATTEMPTS,
  v2ProjectionContract,
  READABLE_GLYPH_RADIUS_CSS,
  applyFixedGlyphPolicy
} from '../../../src/engine/hypertree/layout/index.js';
import { createFocusView } from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from './fixtures.mjs';
import { crowdedFolder, mixedDeepWide, infeasibleDepth } from './crowding-fixtures.mjs';

function build(tree, mode) {
  const { graph } = loadTree(tree);
  if (mode === 'baseline') {
    return { graph, staged: stageRadialLayout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 }) };
  }
  if (mode === 'v1') {
    return { graph, staged: stageExperimentalLayout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true } }) };
  }
  return { graph, staged: stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current', 'end'], nodeOptions: { overridable: true } }) };
}

test('v2 is deterministic and places crowded siblings in multiple bands', () => {
  const a = build(crowdedFolder(), 'v2').staged;
  const b = build(crowdedFolder(), 'v2').staged;
  assert.equal(a.schema, 'experimental-adaptive-layout-v2');
  assert.deepEqual([...a.nodes].map(([id, n]) => [id, n.positions.get('current')]),
    [...b.nodes].map(([id, n]) => [id, n.positions.get('current')]));
  assert.equal(a.feasibility.satisfied, true);
  const bands = new Set([...a.nodes.values()].map((n) => n.bandIndex));
  assert.ok(bands.size >= 2);
  const siblings = a.children.get('dense');
  const rs = siblings.map((id) => a.nodes.get(id).positions.get('current').rho);
  assert.ok(Math.max(...rs) - Math.min(...rs) > 0.01);
});

test('v2 preserves IDs, order, depths, phases, radial order, and open disk', () => {
  const { staged } = build(mixedDeepWide(), 'v2');
  assert.equal(staged.rootId, staged.nodes.get(staged.rootId).id);
  assert.equal(staged.nodes.get(staged.rootId).positions.get('current').rho, 0);
  for (const [parentId, children] of staged.children) {
    if (children.length === 0) continue;
    const parent = staged.nodes.get(parentId);
    let cursor = parent.angleSpan.begin;
    for (const childId of children) {
      const child = staged.nodes.get(childId);
      assert.equal(child.depth, parent.depth + 1);
      assert.ok(Math.abs(child.angleSpan.begin - cursor) <= 1e-12);
      cursor = child.angleSpan.end;
      assert.ok(child.radialRadius > parent.radialRadius);
      assert.ok(child.radialRadius < 1);
      assert.equal(staged.placementRadiiById.get(childId), child.radialRadius);
    }
    assert.ok(Math.abs(cursor - parent.angleSpan.end) <= 1e-9);
  }
  assert.deepEqual(staged.nodes.get('wide').positions.get('current'), staged.nodes.get('wide').positions.get('end'));
  assert.notEqual(staged.nodes.get('wide').positions.get('current'), staged.nodes.get('wide').positions.get('end'));
});

test('v2 fixed glyph policy preserves radius 6 and hit geometry at camera/focus', () => {
  const { staged } = build(f200(), 'v2');
  const focused = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  assert.ok(focused.centerError <= 1e-12);
  const projection = createProjection({ width: 800, height: 600, radius: 240 * staged.feasibility.workspaceScale });
  const dims = new Map([...staged.nodes].map(([id, n]) => [id, Number(n.scale) || 1]));
  const kinds = new Map([...staged.nodes].map(([id, n]) => [id, n.depth < 2 ? 'folder' : 'file']));
  const base = prepareGraphScene(focused.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const fixed = applyFixedGlyphPolicy(base);
  assert.equal(fixed.presentationPolicy.kind, 'fixed-css-glyph');
  assert.equal(fixed.presentationPolicy.radiusCss, READABLE_GLYPH_RADIUS_CSS);
  assert.equal(fixed.presentationPolicy.hitPaddingCss, 0);
  for (const node of fixed.nodes.values()) {
    assert.equal(node.radius, 6);
    assert.equal(node.visible, true);
  }
  const snapshot = createHitSnapshot(fixed);
  const target = fixed.nodes.get('n1');
  assert.equal(hitTestNode(snapshot, { x: target.center.x, y: target.center.y }), 'n1');
  assert.equal(hitTestNode(snapshot, { x: target.center.x + 80, y: target.center.y }), null);
});

test('v2 workspace bounds are finite and secondary projection is explicit', () => {
  const { staged } = build(f200(), 'v2');
  assert.ok(staged.feasibility.workspaceScale >= 1);
  assert.ok(staged.feasibility.workspaceScale <= 16);
  assert.ok(240 * staged.feasibility.workspaceScale <= 3840);
  assert.equal(staged.feasibility.satisfied, true);
});

test('v2 infeasible spacing reports diagnostics and rejects', () => {
  const { graph } = loadTree(infeasibleDepth());
  assert.throws(
    () => stageExperimentalV2Layout(graph, { rootId: 'depth-0', phases: ['current'], experimentV2: { minStep: 0.02 } }),
    (error) => error.code === 'experimental-v2-infeasible'
  );
});

test('v2 invalid configuration and input ownership are explicit', () => {
  const { graph } = loadTree(f20());
  for (const experimentV2 of [
    { bandCount: 0 }, { bandCount: 5 }, { glyphRadiusCss: 0 },
    { clearanceCss: -1 }, { workspaceScaleMax: 17 }, { minStep: 0 }
  ]) {
    assert.throws(
      () => stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], experimentV2 }),
      (error) => error.code === 'invalid-experiment-v2'
    );
  }
  const before = [...graph.nodes].map(([id, n]) => [id, n.data.$dim, n.kind]);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current', 'end'], nodeOptions: { overridable: true } });
  staged.nodes.get('n1').positions.get('current').rho = 0.5;
  assert.equal(staged.nodes.get('n1').positions.get('end').rho, staged.nodes.get('n1').positions.get('end').rho);
  assert.deepEqual([...graph.nodes].map(([id, n]) => [id, n.data.$dim, n.kind]), before);
});
test('v2 bounded scale search rejects non-progressing/excessive ranges and records attempts', () => {
  const { graph } = loadTree(f20());
  const base = { rootId: 'n0', phases: ['current'] };
  assert.throws(() => stageExperimentalV2Layout(graph, { ...base, experimentV2: { workspaceScaleStep: Number.MIN_VALUE } }),
    (error) => error.code === 'invalid-experiment-v2');
  assert.throws(() => stageExperimentalV2Layout(graph, { ...base, experimentV2: { workspaceScaleStep: 0.1 } }),
    (error) => error.code === 'invalid-experiment-v2');
  const exact = stageExperimentalV2Layout(graph, { ...base, experimentV2: { workspaceScaleMin: 1, workspaceScaleMax: 1, workspaceScaleStep: 0.5 } });
  assert.equal(exact.feasibility.candidateCount, 1);
  assert.equal(exact.feasibility.attemptCount, 1);
  assert.equal(exact.feasibility.selectedCandidateIndex, 0);
  const bounded = stageExperimentalV2Layout(graph, { ...base, experimentV2: { workspaceScaleMin: 1, workspaceScaleMax: 16, workspaceScaleStep: 16 / 60 } });
  assert.ok(bounded.feasibility.candidateCount <= V2_MAX_SCALE_ATTEMPTS);
  assert.equal(bounded.feasibility.selectedCandidateIndex, 0);
});

test('v2 non-divisible ranges use bounded index candidates without duplicates', () => {
  const { graph } = loadTree(f20());
  const staged = stageExperimentalV2Layout(graph, {
    rootId: 'n0', phases: ['current'], experimentV2: { workspaceScaleMin: 1, workspaceScaleMax: 1.3, workspaceScaleStep: 0.2 }
  });
  assert.equal(staged.feasibility.candidateCount, 2);
  assert.equal(staged.feasibility.attemptCount, 1);
  assert.equal(staged.feasibility.selectedCandidateIndex, 0);
});

test('v2 rejects invalid ranges and leaves input untouched', () => {
  const { graph } = loadTree(f20());
  const snapshot = [...graph.nodes].map(([id, node]) => [id, node.kind, node.data.$dim]);
  for (const experimentV2 of [
    { safetyMargin: -1 }, { safetyMargin: 1 }, { branchWeight: -1 }, { branchWeight: 11 },
    { radius: 0 }, { radialFlex: -1 }, { radialFlex: 2 }
  ]) {
    assert.throws(
      () => stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], experimentV2 }),
      (error) => error.code === 'invalid-experiment-v2'
    );
  }
  assert.deepEqual([...graph.nodes].map(([id, node]) => [id, node.kind, node.data.$dim]), snapshot);
});

test('v2 reported feasibility scope is local sibling angular capacity only', () => {
  const { staged } = build(f200(), 'v2');
  assert.match(staged.feasibility.projectionScope, /local sibling angular capacity/);
  assert.ok(staged.feasibility.attemptCount >= 1);
  assert.ok(staged.feasibility.selectedCandidateIndex >= 0);
  assert.ok(staged.feasibility.candidateCount <= V2_MAX_SCALE_ATTEMPTS);
});
test('v2 primary scale-1 infeasibility is explicit and secondary scale is separate', () => {
  const { graph } = loadTree(f200());
  assert.throws(
    () => stageExperimentalV2Layout(graph, {
      rootId: 'n0', phases: ['current'],
      experimentV2: { workspaceScaleMin: 1, workspaceScaleMax: 1, workspaceScaleStep: 1 }
    }),
    (error) => error.code === 'experimental-v2-infeasible'
      && error.diagnostics
      && error.diagnostics.candidateCount === 1
      && error.diagnostics.attemptCount === 1
  );
  const secondary = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'] });
  assert.ok(secondary.feasibility.workspaceScale > 1);
  assert.equal(secondary.feasibility.selectedCandidateIndex >= 0, true);
});

test('v2 capacity uses the declared projection radius, not an implicit viewport radius', () => {
  const { graph } = loadTree(f200());
  const at200 = stageExperimentalV2Layout(graph, {
    rootId: 'n0', phases: ['current'], experimentV2: { referenceProjectionRadiusCss: 200 }
  });
  const at240 = stageExperimentalV2Layout(graph, {
    rootId: 'n0', phases: ['current'], experimentV2: { referenceProjectionRadiusCss: 240 }
  });
  assert.equal(at200.feasibility.referenceProjectionRadiusCss, 200);
  assert.equal(at240.feasibility.referenceProjectionRadiusCss, 240);
  assert.ok(at200.feasibility.workspaceScale >= at240.feasibility.workspaceScale);
});
test('v2 projection contract separates radii and invalidates guarantee on resize', () => {
  const before = v2ProjectionContract({
    calculationRadiusCss: 240, displayBaseRadiusCss: 240, workspaceScale: 9.5, cameraZoom: 1
  });
  assert.equal(before.displayedRadiusCss, 2280);
  assert.equal(before.feasibilityGuaranteeApplicable, true);
  const after = v2ProjectionContract({
    calculationRadiusCss: 240, displayBaseRadiusCss: 260, workspaceScale: 9.5, cameraZoom: 2, resized: true
  });
  assert.equal(after.displayedRadiusCss, 2470);
  assert.equal(after.feasibilityGuaranteeApplicable, false);
  assert.equal(after.cameraZoom, 2);
});


