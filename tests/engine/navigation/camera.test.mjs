import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import {
  CAMERA_LIMITS,
  applyCameraToScene,
  cameraForward,
  cameraInverse,
  createCamera,
  normalizeWheelDelta,
  panCamera,
  resetCamera,
  wheelZoomFactor,
  zoomCameraAt
} from '../../../src/engine/hypertree/navigation/index.js';
import { f20 } from '../layout/fixtures.mjs';

const VIEWPORT = { width: 800, height: 600 };

test('camera forward/inverse round trips and reset arithmetically', () => {
  const camera = createCamera({ zoom: 2.5, panX: 37, panY: -19 });
  for (const point of [{ x: 0, y: 0 }, { x: 123, y: 456 }, { x: 799, y: 599 }, { x: -20, y: 30 }]) {
    const screen = cameraForward(camera, point, VIEWPORT);
    const round = cameraInverse(camera, screen, VIEWPORT);
    assert.ok(Math.abs(round.x - point.x) <= 1e-9);
    assert.ok(Math.abs(round.y - point.y) <= 1e-9);
  }
  assert.deepEqual(resetCamera(), { zoom: 1, panX: 0, panY: 0 });
});

test('pointer-anchored zoom keeps the world point stationary at center and off-center', () => {
  const camera = createCamera();
  for (const anchor of [{ x: 400, y: 300 }, { x: 137, y: 421 }, { x: 799, y: 2 }]) {
    const world = cameraInverse(camera, anchor, VIEWPORT);
    const zoomed = zoomCameraAt(camera, 1.8, anchor, VIEWPORT);
    const projected = cameraForward(zoomed, world, VIEWPORT);
    assert.ok(Math.abs(projected.x - anchor.x) <= 1e-9);
    assert.ok(Math.abs(projected.y - anchor.y) <= 1e-9);
  }
});

test('zoom limits and pan bounds are explicit; invalid inputs reject', () => {
  const camera = createCamera();
  const zoomIn = zoomCameraAt(camera, 1000, { x: 400, y: 300 }, VIEWPORT);
  assert.equal(zoomIn.zoom, CAMERA_LIMITS.maxZoom);
  const zoomOut = zoomCameraAt(camera, 0.0001, { x: 400, y: 300 }, VIEWPORT);
  assert.equal(zoomOut.zoom, CAMERA_LIMITS.minZoom);
  const panned = panCamera(camera, CAMERA_LIMITS.maxPanCss * 2, 0);
  assert.equal(panned.panX, CAMERA_LIMITS.maxPanCss);
  assert.throws(() => createCamera({ zoom: 0.1, panX: 0, panY: 0 }), (error) => error.code === 'invalid-camera');
  assert.throws(() => createCamera({ zoom: 1, panX: Number.NaN, panY: 0 }), (error) => error.code === 'invalid-camera');
  assert.throws(() => cameraForward(camera, { x: Infinity, y: 0 }, VIEWPORT), (error) => error.code === 'invalid-camera');
  assert.throws(() => cameraInverse(camera, { x: 0, y: 0 }, { width: -1, height: 2 }), (error) => error.code === 'invalid-viewport');
});

test('wheel delta modes normalize to bounded CSS pixels', () => {
  assert.equal(normalizeWheelDelta(10, 0, VIEWPORT), 10);
  assert.equal(normalizeWheelDelta(2, 1, VIEWPORT), 32);
  assert.equal(normalizeWheelDelta(1, 2, VIEWPORT), 600);
  assert.equal(normalizeWheelDelta(99999, 0, VIEWPORT), CAMERA_LIMITS.wheelMaxCss);
  assert.throws(() => normalizeWheelDelta(1, 3, VIEWPORT), (error) => error.code === 'invalid-wheel');
  assert.ok(wheelZoomFactor(10) < 1);
  assert.ok(wheelZoomFactor(-10) > 1);
});

test('resize preserves camera state relative to new viewport center', () => {
  const camera = createCamera({ zoom: 1.5, panX: 20, panY: -10 });
  const wide = { width: 1000, height: 700 };
  const before = cameraForward(camera, { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }, VIEWPORT);
  const after = cameraForward(camera, { x: wide.width / 2, y: wide.height / 2 }, wide);
  assert.equal(before.x - VIEWPORT.width / 2, 20);
  assert.equal(before.y - VIEWPORT.height / 2, -10);
  assert.equal(after.x - wide.width / 2, 20);
  assert.equal(after.y - wide.height / 2, -10);
});

test('camera scene scales node centers/radii and hyperline geometry exactly once', () => {
  const { graph } = loadTree(f20());
  const staged = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const base = prepareGraphScene(staged, { phase: 'current', projection, nodeDims, nodeKinds });
  const camera = createCamera({ zoom: 2, panX: 30, panY: -20 });
  const transformed = applyCameraToScene(base, camera, projection);
  const baseNode = base.nodes.get('n0');
  const node = transformed.nodes.get('n0');
  const expected = cameraForward(camera, baseNode.center, projection);
  assert.ok(Math.abs(node.center.x - expected.x) <= 1e-9);
  assert.ok(Math.abs(node.center.y - expected.y) <= 1e-9);
  assert.ok(Math.abs(node.radius - baseNode.radius * 2) <= 1e-9);
  assert.equal(transformed.nodes.size, base.nodes.size);
  assert.equal(transformed.edges.length, base.edges.length);
  const edge = base.edges[0];
  const moved = transformed.edges[0];
  const expectedFrom = cameraForward(camera, edge.fromCss, projection);
  assert.ok(Math.abs(moved.fromCss.x - expectedFrom.x) <= 1e-9);
  if (edge.kind === 'arc') assert.ok(Math.abs(moved.radiusCss - edge.radiusCss * 2) <= 1e-9);
  assert.equal(base.nodes.get('n0').radius, baseNode.radius);
  assert.equal(base.nodes.get('n0').center, baseNode.center);
  const snapshot = createHitSnapshot(transformed);
  assert.equal(hitTestNode(snapshot, { x: node.center.x, y: node.center.y }), 'n0');
});
test('camera visibility is recomputed from final screen radius and preserves semantic hiding', () => {
  const projection = { width: 800, height: 600 };
  const base = {
    projection,
    presentation: { minNodeRadius: 0.2 },
    nodes: new Map([
      ['tiny', { id: 'tiny', kind: 'folder', shape: 'circle', visible: false, center: { x: 400, y: 300 }, radius: 0.1, fill: '#fff', stroke: '#fff' }],
      ['exact', { id: 'exact', kind: 'folder', shape: 'circle', visible: false, center: { x: 410, y: 300 }, radius: 0.2, fill: '#fff', stroke: '#fff' }],
      ['semantic-hidden', { id: 'semantic-hidden', kind: 'folder', shape: 'circle', visible: false, center: { x: 420, y: 300 }, radius: 1, fill: '#fff', stroke: '#fff' }],
      ['zero', { id: 'zero', kind: 'folder', shape: 'circle', visible: false, center: { x: 430, y: 300 }, radius: 0, fill: '#fff', stroke: '#fff' }]
    ]),
    edges: []
  };
  const zoomed = applyCameraToScene(base, { zoom: 8, panX: 0, panY: 0 }, projection);
  assert.equal(zoomed.nodes.get('tiny').visible, true);
  assert.equal(zoomed.nodes.get('tiny').radius, 0.8);
  assert.equal(zoomed.nodes.get('exact').visible, true);
  assert.equal(zoomed.nodes.get('semantic-hidden').visible, false);
  assert.equal(zoomed.nodes.get('zero').visible, false);
  const hit = createHitSnapshot(zoomed);
  assert.equal(hitTestNode(hit, zoomed.nodes.get('tiny').center), 'tiny');

  const baseView = applyCameraToScene(base, { zoom: 1, panX: 0, panY: 0 }, projection);
  assert.equal(baseView.nodes.get('tiny').visible, false);
  assert.equal(baseView.nodes.get('exact').visible, false);
  assert.equal(hitTestNode(createHitSnapshot(baseView), baseView.nodes.get('tiny').center), null);

  const zoom2 = applyCameraToScene(base, { zoom: 2, panX: 0, panY: 0 }, projection);
  assert.equal(zoom2.nodes.get('tiny').visible, false);
  assert.equal(zoom2.nodes.get('tiny').radius, 0.2);
  // The renderer's declared comparison is strict (> threshold).
  const zoomJustAbove = applyCameraToScene(base, { zoom: 8, panX: 0, panY: 0 }, projection);
  assert.equal(zoomJustAbove.nodes.get('tiny').visible, true);
});





