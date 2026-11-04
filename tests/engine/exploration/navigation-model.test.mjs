import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, buildFilteredViewLayout, prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { folderRadiusForDepth } from '../../../src/engine/hypertree/exploration/presentation.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const options = { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' };
function setup(make = f20) {
  const tree = make();
  const { graph } = loadTree(tree);
  const base = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const layout = refineExperimentalV2Layout(base, graph, options).staged;
  const model = createExplorationModel({ graph, baseLayout: layout, structuralRootId: tree.id, phase: 'current' });
  return { tree, graph, layout, model };
}
function sceneFor(filtered) {
  const projection = createProjection({ width: 1100, height: 473, radius: 198.66 * filtered.feasibility.workspaceScale });
  return prepareGraphScene(filtered, { phase: 'current', projection });
}

test('initial full-tree view and folder membership = depth context + descendants', () => {
  const { model } = setup();
  const initial = model.view();
  assert.equal(initial.focusedFolderId, 'n0');
  assert.deepEqual(initial.ancestorIds, ['n0']);
  assert.equal(initial.visibleIds.length, 20);
  assert.equal(model.enterFolder('n1').ok, true);
  const view = model.view();
  assert.equal(view.focusedFolderId, 'n1');
  assert.deepEqual(view.ancestorIds, ['n0', 'n1']);
  assert.deepEqual(view.descendantIds, ['n1', 'n3', 'n7', 'n15', 'n16', 'n8', 'n17', 'n18', 'n4', 'n9', 'n19', 'n10']);
  assert.deepEqual(view.visibleIds, ['n0', 'n1', 'n3', 'n7', 'n15', 'n16', 'n8', 'n17', 'n18', 'n4', 'n9', 'n19', 'n10', 'n2']);
  assert.equal(view.visibleEdgeCount, 13);
  assert.equal(view.visibleSet.has('n2'), true);
  assert.equal(view.visibleSet.has('n5'), false);
  assert.equal(view.visibleSet.has('n6'), false);
  for (const [a, b] of view.visibleEdges) assert.ok(view.visibleSet.has(a) && view.visibleSet.has(b));
});

test('F200 membership includes full ancestor path and excludes sibling branches', () => {
  const { model } = setup(f200);
  model.enterFolder('n6');
  const view = model.view();
  assert.equal(view.visibleSet.has('n0'), true);
  assert.equal(view.visibleSet.has('n1'), true);
  assert.equal(view.visibleSet.has('n6'), true);
  assert.equal(view.visibleSet.has('n2'), true);
  assert.equal(view.visibleSet.has('n11'), true);
  assert.equal(view.focusedStructuralDepth, 2);
  assert.equal(view.contextCount, 31);
  assert.equal(view.contextOverlapCount, 1);
});

test('nested node navigation, parent expansion, root click, and idempotent current folder', () => {
  const { model } = setup();
  model.enterFolder('n1');
  const n1First = model.view().visibleIds.length;
  const same = model.enterFolder('n1');
  assert.equal(same.changed, false);
  assert.equal(model.view().visibleIds.length, n1First);
  model.enterFolder('n3');
  assert.deepEqual(model.view().ancestorIds, ['n0', 'n1', 'n3']);
  assert.equal(model.view().visibleSet.has('n1'), true);
  model.enterFolder('n1');
  assert.deepEqual(model.view().ancestorIds, ['n0', 'n1']);
  assert.equal(model.view().visibleSet.has('n4'), true);
  model.enterFolder('n0');
  assert.equal(model.view().focusedFolderId, 'n0');
  assert.equal(model.view().visibleIds.length, 20);
});

test('file selection and programmatic restoration never change folder scope', () => {
  const { model } = setup();
  model.enterFolder('n1');
  const before = model.view().focusedFolderId;
  assert.equal(model.select('n15').ok, true);
  assert.equal(model.selectedId, 'n15');
  assert.equal(model.view().focusedFolderId, before);
  assert.equal(model.details().isFolder, false);
  model.restoreSelection('n15');
  assert.equal(model.view().focusedFolderId, before);
  assert.equal(model.enterFolder('n5').ok, false);
  assert.equal(model.select('n5').ok, false);
});

test('hidden nodes are absent from scene, edges, labels and hits', () => {
  const { layout, model } = setup(f200);
  model.enterFolder('n6');
  const filtered = buildFilteredViewLayout({ baseLayout: layout, view: model.view() });
  assert.equal(filtered.nodes.has('n2'), true);
  assert.equal(filtered.nodes.has('n36'), false);
  const scene = sceneFor(filtered);
  assert.equal(scene.nodes.has('n2'), true);
  assert.equal(scene.nodes.has('n36'), false);
  assert.equal(scene.edges.some((edge) => edge.fromId === 'n36' || edge.toId === 'n36'), false);
  const hit = createHitSnapshot(scene);
  assert.equal(hitTestNode(hit, { x: 0, y: 0 }), null);
  assert.ok(scene.nodes.size === model.view().visibleIds.length);
});

test('centered fit keeps focused folder at center with ancestors contained', () => {
  const { graph, layout, model } = setup(f200);
  model.enterFolder('n6');
  const view = model.view();
  const frame = prepareExplorationFrame({
    ...options, baseRadiusCss: 198.66, graph, baseLayout: layout, view, fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  });
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const focused = frame.scene.nodes.get('n6');
  assert.ok(Math.hypot(focused.center.x - center.x, focused.center.y - center.y) < 1e-6);
  assert.equal(frame.containment.contained, true);
  assert.equal(frame.containment.centeredId, 'n6');
  const root = frame.scene.nodes.get('n0');
  assert.equal(root.radius, 12);
  for (const node of frame.scene.nodes.values()) if (node.kind === 'folder') assert.equal(node.radius, folderRadiusForDepth(layout.depths.get(node.id)));
  const hit = createHitSnapshot(frame.scene);
  for (const ancestor of view.ancestorIds) assert.ok(frame.scene.nodes.has(ancestor));
});

test('descendant and ancestor views remain full-connectivity and authoritative data is immutable', () => {
  const { graph, layout, model } = setup();
  const before = [...layout.nodes].map(([id, n]) => [id, n.positions.get('current').theta, n.positions.get('current').rho]);
  model.enterFolder('n3');
  const filtered = buildFilteredViewLayout({ baseLayout: layout, view: model.view() });
  const scene = sceneFor(filtered);
  assert.equal(scene.edgeCount, model.view().visibleIds.length - 1);
  assert.equal(graph.nodes.size, 20);
  assert.equal(layout.rootId, 'n0');
  assert.deepEqual([...layout.nodes].map(([id, n]) => [id, n.positions.get('current').theta, n.positions.get('current').rho]), before);
});

test('dataset replacement resets scope and legacy navigation actions do not exist', () => {
  const a = setup();
  a.model.enterFolder('n3');
  assert.equal(typeof a.model.back, 'undefined');
  assert.equal(typeof a.model.overview, 'undefined');
  assert.equal(typeof a.model.enterAncestor, 'undefined');
  assert.equal(a.model.snapshot().history, undefined);
  const b = setup(f200);
  assert.equal(b.model.view().focusedFolderId, 'n0');
  assert.equal(b.model.view().visibleIds.length, 200);
});
test('centered-fit infeasible outcome is explicit and not a clipped success', () => {
  const { graph, layout, model } = setup(f200);
  assert.throws(() => prepareExplorationFrame({
    graph, baseLayout: layout, view: model.view(),
    viewport: { width: 100, height: 100 }, padding: 24, baseRadiusCss: 198.66,
    fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  }), /centered-fit-infeasible/);
});







