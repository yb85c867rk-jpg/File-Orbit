import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  CENTER_TOLERANCE_CSS,
  CONTAINMENT_TOLERANCE_CSS,
  createExplorationModel,
  prepareExplorationFrame,
  stageExplorationFrame,
  withinPadding
} from '../../../src/engine/hypertree/exploration/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { f200 } from '../layout/fixtures.mjs';

const baseRadiusCss = 198.66;
function setup() {
  const tree = f200();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, {
    viewport: { width: 1100, height: 473 }, padding: 24, projectionBaseRadiusCss: baseRadiusCss, phase: 'current'
  }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  return { graph, baseLayout, model };
}
function frameFor(ctx, id, viewport, useStage = false) {
  ctx.model.enterFolder('n0');
  assert.equal(ctx.model.enterFolder(id).ok, true);
  const options = {
    graph: ctx.graph, baseLayout: ctx.baseLayout, view: ctx.model.view(), viewport,
    padding: 24, baseRadiusCss, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  };
  if (!useStage) return prepareExplorationFrame(options);
  return stageExplorationFrame({
    ...options,
    adapters: { draw: () => {}, labels: () => {}, installHit: () => {} }
  });
}

test('n30 at 1100x473 uses containment tolerance and keeps center/hits', () => {
  const ctx = setup();
  const viewport = { width: 1100, height: 473 };
  const frame = frameFor(ctx, 'n30', viewport, true);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  assert.ok(Math.hypot(frame.scene.nodes.get('n30').center.x - center.x, frame.scene.nodes.get('n30').center.y - center.y) <= CENTER_TOLERANCE_CSS);
  assert.equal(frame.containment.contained, true);
  assert.equal(frame.containment.paddingToleranceCss, CONTAINMENT_TOLERANCE_CSS);
  const hit = createHitSnapshot(frame.scene);
  for (const ancestor of ctx.model.view().ancestorIds) {
    assert.equal(hitTestNode(hit, frame.scene.nodes.get(ancestor).center), ancestor);
  }
});

test('n38 at 1001x577 uses containment tolerance', () => {
  const ctx = setup();
  const viewport = { width: 1001, height: 577 };
  const frame = frameFor(ctx, 'n38', viewport);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  assert.ok(Math.hypot(frame.scene.nodes.get('n38').center.x - center.x, frame.scene.nodes.get('n38').center.y - center.y) <= CENTER_TOLERANCE_CSS);
  assert.equal(frame.containment.contained, true);
  assert.equal(frame.containment.paddingToleranceCss, CONTAINMENT_TOLERANCE_CSS);
});

test('all F200 folders fit at all requested viewports', () => {
  const ctx = setup();
  const folders = [...ctx.graph.nodes].filter(([, node]) => node.kind === 'folder').map(([id]) => id);
  assert.equal(folders.length, 40);
  for (const viewport of [{ width: 1100, height: 473 }, { width: 1001, height: 577 }, { width: 800, height: 600 }]) {
    for (const id of folders) {
      const frame = frameFor(ctx, id, viewport);
      assert.equal(frame.containment.contained, true, `${id}@${viewport.width}x${viewport.height}`);
      assert.equal(frame.containment.centeredId, id);
      assert.ok(frame.containment.centerError <= CENTER_TOLERANCE_CSS, `${id} center`);
      assert.equal(frame.containment.paddingToleranceCss, CONTAINMENT_TOLERANCE_CSS);
    }
  }
});

test('genuine padding violation beyond tolerance is rejected', () => {
  const viewport = { width: 200, height: 200 };
  const inside = { center: { x: 30, y: 30 }, radius: 6 };
  const withinRoundoff = { center: { x: 24 - CONTAINMENT_TOLERANCE_CSS / 2 + 6, y: 30 }, radius: 6 };
  const genuine = { center: { x: 24 - CONTAINMENT_TOLERANCE_CSS * 10 + 6, y: 30 }, radius: 6 };
  assert.equal(withinPadding(inside, viewport, 24), true);
  assert.equal(withinPadding(withinRoundoff, viewport, 24), true);
  assert.equal(withinPadding(genuine, viewport, 24), false);
  assert.equal(withinPadding(genuine, viewport, 24, 0), false);
});

test('adaptive fit retains visible context when the scene is within the label budget', () => {
  const ctx = setup();
  const viewport = { width: 1100, height: 473 };
  ctx.model.enterFolder('n0');
  assert.equal(ctx.model.enterFolder('n30').ok, true);
  const view = ctx.model.view();
  const frame = prepareExplorationFrame({
    graph: ctx.graph, baseLayout: ctx.baseLayout, view, viewport,
    padding: 24, baseRadiusCss, fit: true, camera: null,
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, fitSubtree: 'adaptive', labelBudget: 64
  });
  assert.equal(frame.containment.scope, 'all-visible');
  assert.equal(frame.containment.contained, true);
  assert.equal(frame.containment.containedCount, view.visibleIds.length);
  assert.equal(frame.scene.nodes.size, view.visibleIds.length);
});

test('adaptive fit falls back to the active branch above the label budget', () => {
  const ctx = setup();
  const viewport = { width: 1100, height: 473 };
  ctx.model.enterFolder('n0');
  assert.equal(ctx.model.enterFolder('n30').ok, true);
  const view = ctx.model.view();
  const activeIds = new Set([...view.ancestorIds, ...view.descendantIds]);
  const frame = prepareExplorationFrame({
    graph: ctx.graph, baseLayout: ctx.baseLayout, view, viewport,
    padding: 24, baseRadiusCss, fit: true, camera: null,
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, fitSubtree: 'adaptive', labelBudget: 1
  });
  assert.equal(frame.containment.scope, 'active-branch');
  assert.equal(frame.containment.contained, true);
  assert.equal(frame.containment.totalCount, activeIds.size);
  assert.ok(frame.scene.nodes.size > activeIds.size);
});
