import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  CAMERA_LIMITS,
  EXPERIMENTAL_CAMERA_LIMITS,
  calculateFitCamera,
  cameraForward,
  cameraInverse,
  createMouseNavigationController,
  normalizeCamera,
  prepareCameraFrame,
  prepareFitFrame,
  prepareResetFocusFrame,
  resetCamera,
  resolveResizeFraming,
  zoomCameraAt,
  applyCameraToScene,
  requireFitCamera
} from '../../../src/engine/hypertree/navigation/index.js';
import {
  createFocusView
} from '../../../src/engine/hypertree/focus/index.js';
import {
  stageRadialLayout,
  stageExperimentalV2Layout,
  stageExperimentalLayout,
  refineExperimentalV2Layout,
  applyFixedGlyphPolicy
} from '../../../src/engine/hypertree/layout/index.js';
import {
  createProjection,
  prepareGraphScene,
  drawGraphScene
} from '../../../src/engine/hypertree/render/index.js';
import {
  createHitSnapshot,
  hitTestNode,
  createSelectionController,
  installSelectionFrame
} from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from './../layout/fixtures.mjs';
import { crowdedFolder, mixedDeepWide } from './../layout/crowding-fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const fixed = { kind: 'fixed', glyphRadiusCss: 6 };

function node(id, x, y, radius = 4) {
  return { id, center: { x, y }, radius, visible: true, shape: 'circle' };
}

test('fit includes glyph extents and derives nonzero pan for an asymmetric layout', () => {
  const nodes = [node('a', 100, 100), node('b', 500, 180), node('c', 900, 260)];
  const fit = calculateFitCamera({ nodes, viewport, padding: 20, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(fit.ok, true);
  assert.equal(fit.containedCount, 3);
  assert.notEqual(fit.camera.panX, 0);
  assert.notEqual(fit.camera.panY, 0);
  for (const item of nodes) {
    const screen = cameraForward(fit.camera, item.center, viewport, EXPERIMENTAL_CAMERA_LIMITS);
    assert.ok(screen.x - 6 >= 20 - 1e-6);
    assert.ok(screen.y - 6 >= 20 - 1e-6);
    assert.ok(screen.x + 6 <= viewport.width - 20 + 1e-6);
    assert.ok(screen.y + 6 <= viewport.height - 20 + 1e-6);
  }
});

test('fixed and native glyph policies use different zoom calculations', () => {
  const nodes = [node('a', 0, 0, 20), node('b', 400, 0, 20)];
  const fixedFit = calculateFitCamera({ nodes, viewport, padding: 20, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  const nativeFit = calculateFitCamera({ nodes, viewport, padding: 20, presentation: { kind: 'native' }, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(fixedFit.ok, true);
  assert.equal(nativeFit.ok, true);
  assert.notEqual(fixedFit.appliedZoom, nativeFit.appliedZoom);
  assert.equal(fixedFit.presentation.glyphRadiusCss, 6);
  assert.equal(nativeFit.presentation.glyphRadiusCss, null);
});

test('fit includes offscreen eligible nodes and leaves the input unchanged', () => {
  const nodes = [node('a', -10000, -8000), node('b', 10000, 8000), node('hidden', 0, 0)];
  nodes[2].visible = false;
  const snapshot = JSON.stringify(nodes);
  const fit = calculateFitCamera({ nodes, viewport, padding: 10, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(fit.ok, true);
  assert.equal(fit.eligibleCount, 2);
  assert.equal(fit.containedCount, 2);
  assert.equal(fit.clippedCount, 0);
  assert.equal(JSON.stringify(nodes), snapshot);
  assert.equal(fit.nodes, undefined);
});

test('F200 enlarged workspace requires zoom below .25 and fits every eligible node', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const projection = createProjection({ width: 1100, height: 473, radius: 240 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const fixedScene = applyFixedGlyphPolicy(base);
  const fit = calculateFitCamera({
    nodes: [...fixedScene.nodes.values()],
    viewport,
    padding: 24,
    presentation: fixed,
    projectionScale: staged.feasibility.workspaceScale,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.equal(fit.ok, true);
  assert.ok(fit.appliedZoom < 0.25);
  assert.ok(fit.appliedZoom >= EXPERIMENTAL_CAMERA_LIMITS.minZoom);
  assert.equal(fit.containedCount, 200);
  assert.equal(fit.clippedCount, 0);
  assert.throws(() => normalizeCamera(fit.camera), (error) => error.code === 'invalid-camera');
  assert.equal(normalizeCamera(fit.camera, EXPERIMENTAL_CAMERA_LIMITS).zoom, fit.camera.zoom);
  const defaultLimitFit = calculateFitCamera({
    nodes: [...fixedScene.nodes.values()], viewport, padding: 24, presentation: fixed, limits: CAMERA_LIMITS
  });
  assert.equal(defaultLimitFit.reason, 'min-zoom-exceeded');
});

test('crowdedFolder and mixedDeepWide fit without changing node counts', () => {
  for (const make of [crowdedFolder, mixedDeepWide]) {
    const { graph } = loadTree(make());
    const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
    const projection = createProjection({ width: 900, height: 600, radius: 240 * staged.feasibility.workspaceScale });
    const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
    const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
    const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
    const fixedScene = applyFixedGlyphPolicy(base);
    const before = fixedScene.nodes.size;
    const fit = calculateFitCamera({ nodes: [...fixedScene.nodes.values()], viewport: { width: 900, height: 600 }, padding: 20, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
    assert.equal(fit.ok, true);
    assert.equal(fit.eligibleCount, before);
    assert.equal(fixedScene.nodes.size, before);
  }
});

test('single root and empty input are defined', () => {
  const single = calculateFitCamera({ nodes: [node('root', 10, 20)], viewport, padding: 10, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(single.ok, true);
  assert.equal(single.camera.zoom, 1);
  assert.equal(single.containedCount, 1);
  const empty = calculateFitCamera({ nodes: [], viewport, padding: 10, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(empty.ok, true);
  assert.equal(empty.empty, true);
  assert.deepEqual(empty.camera, { zoom: 1, panX: 0, panY: 0 });
});

test('zero viewport, infeasible minimum zoom, invalid geometry, and failure immutability', () => {
  assert.equal(calculateFitCamera({ nodes: [], viewport: { width: 0, height: 0 }, presentation: fixed }).reason, 'invalid-viewport');
  const huge = calculateFitCamera({
    nodes: [node('a', 0, 0), node('b', 1e9, 0)], viewport, padding: 10, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.equal(huge.ok, false);
  assert.equal(huge.reason, 'min-zoom-exceeded');
  assert.equal(huge.camera, null);
  const invalid = [node('a', Number.NaN, 0)];
  assert.equal(calculateFitCamera({ nodes: invalid, viewport, presentation: fixed }).reason, 'invalid-geometry');
  assert.equal(invalid[0].center.x, Number.NaN);
  assert.throws(() => requireFitCamera(huge), (error) => error.code === 'fit-infeasible');
});

test('experimental limit allows zoom below .25 while default still rejects it', () => {
  const input = { zoom: 0.1, panX: 0, panY: 0 };
  assert.throws(() => normalizeCamera(input), (error) => error.code === 'invalid-camera');
  const accepted = normalizeCamera(input, EXPERIMENTAL_CAMERA_LIMITS);
  assert.equal(accepted.zoom, 0.1);
  const low = zoomCameraAt({ zoom: 0.25, panX: 0, panY: 0 }, 0.5, { x: 550, y: 236 }, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  assert.equal(low.zoom, 0.125);
  const clamped = zoomCameraAt({ zoom: 0.25, panX: 0, panY: 0 }, 0.5, { x: 550, y: 236 }, viewport);
  assert.equal(clamped.zoom, 0.25);
});

test('fit camera is accepted by controller/render/hit pipeline with selection consistency', () => {
  const { graph } = loadTree(f20());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const projection = createProjection({ width: 1100, height: 473, radius: 240 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const fixedScene = applyFixedGlyphPolicy(base);
  const fit = calculateFitCamera({ nodes: [...fixedScene.nodes.values()], viewport, padding: 20, presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS });
  assert.equal(fit.ok, true);
  const camera = normalizeCamera(fit.camera, EXPERIMENTAL_CAMERA_LIMITS);
  const listeners = new Map();
  const canvas = {
    ownerDocument: null, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1100, height: 473 }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {}
  };
  const nav = createMouseNavigationController(canvas, {
    viewport, camera, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    onCameraChange: () => {}
  });
  assert.equal(nav.getState().camera.zoom, camera.zoom);
  nav.update({ camera, viewport, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  const cameraScene = applyCameraToScene(fixedScene, camera, viewport);
  const snap = createHitSnapshot(cameraScene);
  for (const item of fixedScene.nodes.values()) {
    if (item.kind !== 'folder') continue;
    const screen = cameraForward(camera, item.center, viewport, EXPERIMENTAL_CAMERA_LIMITS);
    assert.equal(hitTestNode(snap, screen), item.id);
  }
  nav.destroy();
});
test('F200 fit below .25 passes shared transform, mocked draw, hit install, and probe path', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const projection = createProjection({ width: 1100, height: 473, radius: 240 * staged.feasibility.workspaceScale });
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
  const fixedScene = applyFixedGlyphPolicy(base);
  const fit = calculateFitCamera({
    nodes: [...fixedScene.nodes.values()], viewport, padding: 24, presentation: fixed,
    projectionScale: staged.feasibility.workspaceScale, limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.equal(fit.ok, true);
  assert.ok(fit.appliedZoom < 0.25);
  assert.throws(() => applyCameraToScene(fixedScene, fit.camera, viewport), (error) => error.code === 'invalid-camera');
  const cameraScene = applyCameraToScene(fixedScene, fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  const fixedCameraScene = applyFixedGlyphPolicy(cameraScene);
  const surface = fakeSurface();
  const draw = drawGraphScene(surface, fixedCameraScene, { selectedId: null });
  assert.equal(draw.drawnNodes, [...fixedCameraScene.nodes.values()].filter((node) => node.kind === 'folder').length);
  const snapshot = createHitSnapshot(fixedCameraScene);
  const target = fixedCameraScene.nodes.get('n13');
  assert.equal(hitTestNode(snapshot, target.center), 'n13');
  const listeners = new Map();
  const canvas = {
    ownerDocument: null, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1100, height: 473 }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {}
  };
  const controller = createSelectionController(canvas);
  const install = installSelectionFrame(controller, {
    scene: fixedCameraScene, generation: 7, selectedId: 'n13',
    draw: () => drawGraphScene(surface, fixedCameraScene, { selectedId: 'n13' })
  });
  assert.equal(controller.getState().selectedId, 'n13');
  assert.equal(controller.getState().generation, 7);
  assert.equal(install.state.selectedId, 'n13');
  const world = cameraInverse(fit.camera, { x: 550, y: 236.5 }, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  const screen = cameraForward(fit.camera, world, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  assert.ok(Math.abs(screen.x - 550) <= 1e-9);
  assert.ok(Math.abs(screen.y - 236.5) <= 1e-9);
  for (const node of fixedCameraScene.nodes.values()) {
    assert.ok(node.center.x - 6 >= 24 - 1e-6);
    assert.ok(node.center.y - 6 >= 24 - 1e-6);
    assert.ok(node.center.x + 6 <= 1100 - 24 + 1e-6);
    assert.ok(node.center.y + 6 <= 473 - 24 + 1e-6);
  }
  controller.destroy();
});

function fakeSurface() {
  const calls = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', lineDashOffset: 0,
    shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0,
    filter: 'none', lineJoin: 'round', lineCap: 'round', miterLimit: 10,
    setLineDash(v) { calls.push(v); },
    save() {}, restore() {},
    fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}
  };
  return {
    calls,
    context: ctx,
    getMetrics: () => ({ cssWidth: 1100, cssHeight: 473, backingWidth: 1100, backingHeight: 473, dpr: 1 }),
    clear() {}
  };
}
test('A: initial v2 F200 fit uses the new workspace projection, not stale workspace-1', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const view = createFocusView(staged, { focusId: null, phase: 'current' });
  const stale = createProjection({ ...viewport, radius: 198.66 });
  assert.equal(stale.radius, 198.66);
  const frame = prepareFitFrame({
    view, phase: 'current', viewport, baseRadiusCss: 198.66,
    workspaceScale: staged.feasibility.workspaceScale, padding: 24,
    presentation: fixed, limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, graph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  assert.equal(frame.fit.ok, true);
  assert.equal(frame.projection.radius, 198.66 * staged.feasibility.workspaceScale);
  assert.notEqual(frame.projection.radius, stale.radius);
  const final = applyCameraToScene(frame.fitScene, frame.fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS);
  const fixedFinal = applyFixedGlyphPolicy(final);
  assertContained(fixedFinal, viewport, 24);
  assert.equal(frame.fit.containedCount, 200);
});

test('B: baseline/v2 replacement frames use their own projection and workspace', () => {
  const baselineTree = f20();
  const v2Tree = f200();
  const baseline = stageRadialLayout(loadTree(baselineTree).graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  const v2 = stageExperimentalV2Layout(loadTree(v2Tree).graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const baseGraph = loadTree(v2Tree).graph;
  const baselineFrame = prepareFitFrame({
    view: createFocusView(baseline, { focusId: null, phase: 'current' }), phase: 'current', viewport,
    baseRadiusCss: 198.66, workspaceScale: 1, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, baseGraph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  const v2Frame = prepareFitFrame({
    view: createFocusView(v2, { focusId: null, phase: 'current' }), phase: 'current', viewport,
    baseRadiusCss: 198.66, workspaceScale: v2.feasibility.workspaceScale, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, baseGraph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  assert.equal(baselineFrame.projection.radius, 198.66);
  assert.equal(v2Frame.projection.radius, 198.66 * v2.feasibility.workspaceScale);
  assert.equal(baselineFrame.fit.ok, true);
  assert.equal(v2Frame.fit.ok, true);
});

test('C: resize-in-fit recomputes fit with the new viewport and final containment', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const view = createFocusView(staged, { focusId: null, phase: 'current' });
  for (const vp of [{ width: 1100, height: 473 }, { width: 800, height: 600 }]) {
    const frame = prepareFitFrame({
      view, phase: 'current', viewport: vp, baseRadiusCss: 198.66,
      workspaceScale: staged.feasibility.workspaceScale, padding: 24, presentation: fixed,
      limits: EXPERIMENTAL_CAMERA_LIMITS,
      prepareScene: (v, projection) => makeSceneFor(v, graph, projection),
      applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
    });
    assert.equal(frame.fit.ok, true);
    const final = applyFixedGlyphPolicy(applyCameraToScene(frame.fitScene, frame.fit.camera, vp, EXPERIMENTAL_CAMERA_LIMITS));
    assertContained(final, vp, 24);
  }
});

test('D: manual resize preserves camera; fit resize delegates to fit mode', () => {
  const camera = { zoom: 0.42, panX: 13, panY: -9 };
  const manual = resolveResizeFraming({ framingMode: 'manual', currentCamera: camera, fitCamera: null });
  assert.deepEqual(manual, { mode: 'manual', camera });
  const fitCamera = { zoom: 0.0955, panX: -3.1, panY: 0.5 };
  const fitted = resolveResizeFraming({ framingMode: 'fit', currentCamera: camera, fitCamera });
  assert.deepEqual(fitted, { mode: 'fit', camera: fitCamera });
});

test('E: Fit graph on focused view preserves focus and installs matching hit geometry', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const view = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  const frame = prepareFitFrame({
    view, phase: 'current', viewport, baseRadiusCss: 198.66,
    workspaceScale: staged.feasibility.workspaceScale, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, graph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  assert.equal(view.requestedId, 'n13');
  assert.equal(frame.fit.ok, true);
  const final = applyFixedGlyphPolicy(applyCameraToScene(frame.fitScene, frame.fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
  const snap = createHitSnapshot(final);
  assert.equal(hitTestNode(snap, final.nodes.get('n13').center), 'n13');
});

function makeSceneFor(view, graph, projection) {
  const dims = new Map([...graph.nodes].map(([id, n]) => [id, Number(n.data.$dim) || 0]));
  const kinds = new Map([...graph.nodes].map(([id, n]) => [id, n.kind]));
  return prepareGraphScene(view.staged, { phase: 'current', projection, nodeDims: dims, nodeKinds: kinds });
}

function assertContained(scene, vp, padding) {
  for (const node of scene.nodes.values()) {
    if (!node.visible) continue;
    assert.ok(node.center.x - node.radius >= padding - 1e-6);
    assert.ok(node.center.y - node.radius >= padding - 1e-6);
    assert.ok(node.center.x + node.radius <= vp.width - padding + 1e-6);
    assert.ok(node.center.y + node.radius <= vp.height - padding + 1e-6);
  }
}
test('shared drawing boundary consumes the supplied projection and rejects a mismatched one', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const view = createFocusView(staged, { focusId: null, phase: 'current' });
  const frame = prepareFitFrame({
    view, phase: 'current', viewport, baseRadiusCss: 198.66,
    workspaceScale: staged.feasibility.workspaceScale, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, graph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  const expected = frame.projection;
  const supplied = Object.freeze({ ...expected, marker: 'fit-frame-supplied' });
  let preparedWith = null;
  const prepared = prepareCameraFrame({
    view, camera: frame.fit.camera, viewport,
    suppliedProjection: supplied, expectedProjection: expected,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => { preparedWith = projection; return makeSceneFor(v, graph, projection); },
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  assert.equal(preparedWith, supplied);
  assert.equal(prepared.projection, supplied);
  assertContained(prepared.cameraScene, viewport, 24);
  assert.throws(
    () => prepareCameraFrame({
      view, camera: frame.fit.camera, viewport,
      suppliedProjection: { ...expected, radius: expected.radius - 1 },
      expectedProjection: expected, limits: EXPERIMENTAL_CAMERA_LIMITS,
      prepareScene: (v, projection) => makeSceneFor(v, graph, projection)
    }),
    (error) => error.code === 'projection-mismatch'
  );
});
test('Reset focus action fits authoritative base views across v2/refinement/baseline/v1', () => {
  const cases = [];
  {
    const tree = f200();
    const { graph } = loadTree(tree);
    const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
    cases.push({ graph, staged, name: 'v2' });
    cases.push({ graph, staged: refineExperimentalV2Layout(staged, graph, {
      viewport, padding: 24, projectionBaseRadiusCss: 198.66
    }).staged, name: 'v2-refined' });
  }
  {
    const tree = f200();
    const { graph } = loadTree(tree);
    cases.push({ graph, staged: stageExperimentalLayout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } }), name: 'v1' });
    cases.push({ graph, staged: stageRadialLayout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 }), name: 'baseline' });
  }
  for (const item of cases) {
    const baseView = createFocusView(item.staged, { focusId: null, phase: 'current' });
    const workspaceScale = item.staged.feasibility?.workspaceScale || 1;
    const prepared = prepareResetFocusFrame({
      baseView, phase: 'current', viewport, baseRadiusCss: 198.66,
      workspaceScale, padding: 24, presentation: fixed,
      limits: EXPERIMENTAL_CAMERA_LIMITS,
      prepareScene: (v, projection) => makeSceneFor(v, item.graph, projection),
      applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
    });
    assert.equal(prepared.view, baseView);
    assert.equal(prepared.view.requestedId, null);
    assert.equal(prepared.fit.ok, true);
    const final = applyFixedGlyphPolicy(applyCameraToScene(prepared.fitScene, prepared.fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
    assertContained(final, viewport, 24);
    if (item.name === 'v2' || item.name === 'v2-refined') {
      assert.ok(prepared.fit.appliedZoom < 1);
    }
  }
  assert.equal(resetCamera().zoom, 1);
});

test('Reset focus preserves selection and does not clear requested focus on failure', () => {
  const { graph } = loadTree(f200());
  const staged = stageExperimentalV2Layout(graph, { rootId: 'n0', phases: ['current'], nodeOptions: { overridable: true } });
  const baseView = createFocusView(staged, { focusId: null, phase: 'current' });
  const focusedView = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  assert.throws(() => prepareResetFocusFrame({
    baseView: focusedView, phase: 'current', viewport, baseRadiusCss: 198.66,
    workspaceScale: staged.feasibility.workspaceScale, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, graph, projection)
  }), (error) => error.code === 'invalid-reset-focus');
  const prepared = prepareResetFocusFrame({
    baseView, phase: 'current', viewport, baseRadiusCss: 198.66,
    workspaceScale: staged.feasibility.workspaceScale, padding: 24, presentation: fixed,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    prepareScene: (v, projection) => makeSceneFor(v, graph, projection),
    applyFixedGlyph: (scene) => applyFixedGlyphPolicy(scene)
  });
  const final = applyFixedGlyphPolicy(applyCameraToScene(prepared.fitScene, prepared.fit.camera, viewport, EXPERIMENTAL_CAMERA_LIMITS));
  const listeners = new Map();
  const canvas = {
    ownerDocument: null, clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1100, height: 473 }),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {}
  };
  const controller = createSelectionController(canvas);
  installSelectionFrame(controller, {
    scene: final, generation: 21, selectedId: 'n13',
    draw: () => ({ drawResult: { drawnNodes: 200, drawnEdges: 199, selectionDrawn: true }, labels: {} })
  });
  assert.equal(controller.getState().selectedId, 'n13');
  assert.equal(controller.getState().generation, 21);
  controller.destroy();
});


