import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HIT_PADDING_CSS,
  createHitSnapshot,
  hitTestNode,
  snapshotContainsHittableId,
  GraphRenderError
} from '../../../src/engine/hypertree/interaction/index.js';

function node(id, options = {}) {
  return {
    id,
    kind: options.kind || 'folder',
    shape: options.shape || 'diamond',
    visible: options.visible !== false,
    center: options.center || { x: 100, y: 100 },
    radius: options.radius ?? 10
  };
}

function scene(nodes) {
  return { nodes: new Map(nodes.map((n) => [n.id, n])) };
}

test('circle and diamond hit boundaries are inclusive; outside is not hit', () => {
  const circle = createHitSnapshot(scene([node('c', { shape: 'circle', radius: 10 })]));
  assert.equal(hitTestNode(circle, { x: 100, y: 100 }), 'c');
  assert.equal(hitTestNode(circle, { x: 110, y: 100 }), 'c');
  assert.equal(hitTestNode(circle, { x: 100, y: 110 }), 'c');
  assert.equal(hitTestNode(circle, { x: 110.4, y: 100 }), null);
  assert.equal(hitTestNode(circle, { x: 110.0001, y: 100 }), null);
  assert.equal(hitTestNode(circle, { x: 107.08, y: 107.08 }), null);

  const diamond = createHitSnapshot(scene([node('d', { shape: 'diamond', radius: 10 })]));
  assert.equal(hitTestNode(diamond, { x: 100, y: 100 }), 'd');
  assert.equal(hitTestNode(diamond, { x: 110, y: 100 }), 'd');
  assert.equal(hitTestNode(diamond, { x: 105, y: 105 }), 'd');
  assert.equal(hitTestNode(diamond, { x: 105.1, y: 105 }), null);
  assert.equal(hitTestNode(diamond, { x: 110.1, y: 100 }), null);
});

test('hidden/zero-radius nodes are not hittable; padding is zero', () => {
  const snapshot = createHitSnapshot(scene([
    node('hidden', { visible: false }),
    node('zero', { radius: 0 }),
    node('visible', { center: { x: 200, y: 100 } })
  ]));
  assert.equal(hitTestNode(snapshot, { x: 100, y: 100 }), null);
  assert.equal(hitTestNode(snapshot, { x: 200, y: 100 }), 'visible');
  assert.equal(HIT_PADDING_CSS, 0);
  assert.equal(snapshot.padding, 0);
  assert.equal(snapshotContainsHittableId(snapshot, 'hidden'), false);
  assert.equal(snapshotContainsHittableId(snapshot, 'zero'), false);
  assert.equal(snapshotContainsHittableId(snapshot, 'visible'), true);
});

test('reverse drawing order resolves overlapping nodes', () => {
  const snapshot = createHitSnapshot(scene([
    node('first', { shape: 'circle', radius: 20 }),
    node('last', { shape: 'circle', radius: 20 }),
    node('hidden-last', { shape: 'circle', radius: 20, visible: false })
  ]));
  assert.equal(hitTestNode(snapshot, { x: 100, y: 100 }), 'last');
});

test('modern transformed radius differs from oversized legacy hit region', () => {
  // Rendered modern radius is 2px; the legacy contains() would use dim=10.
  const snapshot = createHitSnapshot(scene([node('peripheral', { shape: 'circle', radius: 2 })]));
  assert.equal(hitTestNode(snapshot, { x: 105, y: 100 }), null);
  assert.equal(hitTestNode(snapshot, { x: 101.9, y: 100 }), 'peripheral');
});

test('caller mutation after snapshot does not alter installed hit geometry', () => {
  const source = scene([node('x', { shape: 'circle', radius: 5, center: { x: 50, y: 50 } })]);
  const snapshot = createHitSnapshot(source);
  source.nodes.get('x').center.x = 500;
  source.nodes.get('x').radius = 50;
  assert.equal(hitTestNode(snapshot, { x: 50, y: 50 }), 'x');
  assert.equal(hitTestNode(snapshot, { x: 500, y: 50 }), null);
});

test('invalid hit scenes/points reject without coercion', () => {
  for (const bad of [
    scene([node('x', { center: { x: Number.NaN, y: 0 } })]),
    scene([node('x', { center: { x: 0, y: Infinity } })]),
    scene([node('x', { radius: -1 })]),
    scene([node('x', { radius: Infinity })]),
    { nodes: new Map([['x', { ...node('x'), id: 'other' }]]) },
    scene([{ ...node('x'), kind: 'other' }]),
    scene([{ ...node('x'), shape: 'square' }]),
    scene([{ ...node('x'), visible: 'yes' }])
  ]) {
    assert.throws(() => createHitSnapshot(bad), (error) => error instanceof GraphRenderError && error.code === 'invalid-hit-scene');
  }
  const snapshot = createHitSnapshot(scene([node('x')]));
  assert.throws(() => hitTestNode(snapshot, { x: Number.NaN, y: 0 }), (error) => error.code === 'invalid-point');
});

test('non-string IDs and scene node limits are rejected', () => {
  const badMap = new Map();
  badMap.set(7, node('x'));
  assert.throws(() => createHitSnapshot({ nodes: badMap }), (error) => error.code === 'invalid-hit-scene');
  const nodes = [];
  for (let i = 0; i < 1501; i += 1) nodes.push(node(`n${i}`));
  assert.throws(() => createHitSnapshot(scene(nodes)), (error) => error.code === 'invalid-hit-scene');
});
test('data files never retain interactive hit geometry even with internal diamond bounds', () => {
  const snapshot = createHitSnapshot(scene([node('data', { kind: 'file', shape: 'diamond', radius: 10 })]));
  assert.equal(hitTestNode(snapshot, { x: 100, y: 100 }), null);
  assert.equal(snapshotContainsHittableId(snapshot, 'data'), false);
});test('last-drawn folder wins for overlapping variable radii; hit radii match final scene', () => {
  const scene = { nodes: new Map([
    ['root', { id: 'root', kind: 'folder', shape: 'circle', visible: true, depth: 0, center: { x: 0, y: 0 }, radius: 12 }],
    ['child', { id: 'child', kind: 'folder', shape: 'circle', visible: true, depth: 1, center: { x: 5, y: 0 }, radius: 9.6 }]
  ]) };
  const hit = createHitSnapshot(scene);
  assert.equal(hitTestNode(hit, { x: 5, y: 0 }), 'child');
  assert.equal(hitTestNode(hit, { x: -11, y: 0 }), 'root');
  assert.equal(hitTestNode(hit, { x: 30, y: 0 }), null);
  assert.equal(hit.nodes.find((node) => node.id === 'root').radius, 12);
  assert.equal(hit.nodes.find((node) => node.id === 'child').radius, 9.6);
});



