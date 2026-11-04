import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  FOCUS_CENTER_TOLERANCE,
  createFocusView
} from '../../../src/engine/hypertree/focus/index.js';
import { createProjection, prepareGraphScene } from '../../../src/engine/hypertree/render/index.js';
import { createHitSnapshot, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';
import { legacyMobius } from './legacy-mobius-oracle.mjs';

function layoutFor(tree) {
  const { graph } = loadTree(tree);
  const staged = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  return { graph, staged };
}

function position(base, id, phase) {
  const p = base.nodes.get(id).positions.get(phase);
  return { x: p.rho * Math.cos(p.theta), y: p.rho * Math.sin(p.theta) };
}

function fakeBase(entry) {
  const positions = new Map(Object.entries(entry));
  return {
    rootId: 'r',
    firstPhase: 'current',
    phases: ['current', 'end'],
    children: new Map([['r', []]]),
    nodes: new Map([['r', {
      depth: 0,
      positions,
      spans: new Map(),
      dimQuotients: new Map(),
      scale: 1
    }]])
  };
}

test('identity view preserves base coordinates/topology and does not alias positions', () => {
  const { staged } = layoutFor(f20());
  const view = createFocusView(staged, { focusId: null, phase: 'current' });
  assert.equal(view.requestedId, null);
  assert.equal(view.centeredId, null);
  assert.equal(view.centerError, 0);
  assert.equal(view.staged.rootId, staged.rootId);
  assert.deepEqual([...view.staged.nodes.keys()], [...staged.nodes.keys()]);
  assert.deepEqual([...view.staged.nodes.values()].map((n) => n.depth), [...staged.nodes.values()].map((n) => n.depth));
  for (const id of staged.nodes.keys()) {
    assert.deepEqual(view.staged.nodes.get(id).positions.get('current'), staged.nodes.get(id).positions.get('current'));
    assert.notEqual(view.staged.nodes.get(id).positions, staged.nodes.get(id).positions);
  }
  view.staged.nodes.get('n0').positions.set('current', { theta: 9, rho: 0.5 });
  assert.notDeepEqual(staged.nodes.get('n0').positions.get('current'), { theta: 9, rho: 0.5 });
});

test('requested node is centered; requestedId/centeredId are the requested stable ID', () => {
  for (const tree of [f20(), f200()]) {
    const { staged } = layoutFor(tree);
    for (const id of ['n0', 'n13', staged.nodes.keys().find((key) => key !== 'n0')]) {
      const view = createFocusView(staged, { focusId: id, phase: 'current' });
      assert.equal(view.requestedId, id);
      assert.equal(view.centeredId, id);
      assert.ok(view.centerError <= FOCUS_CENTER_TOLERANCE);
      const centered = view.staged.nodes.get(id).positions.get('current');
      assert.ok(Math.hypot(centered.rho, 0) <= FOCUS_CENTER_TOLERANCE);
    }
  }
});

test('pure transformation matches actual legacy Möbius operations', () => {
  for (const tree of [f20(), f200()]) {
    const { staged } = layoutFor(tree);
    const focusId = 'n13';
    const focus = position(staged, focusId, 'current');
    const c = { x: -focus.x, y: -focus.y };
    const view = createFocusView(staged, { focusId, phase: 'current' });
    assert.ok(Math.hypot(...Object.values(legacyMobius(focus, c))) <= 1e-12);
    for (const [id, record] of staged.nodes) {
      const input = position(staged, id, 'current');
      const expected = legacyMobius(input, c);
      const actualPosition = view.staged.nodes.get(id).positions.get('current');
      const actual = {
        x: actualPosition.rho * Math.cos(actualPosition.theta),
        y: actualPosition.rho * Math.sin(actualPosition.theta)
      };
      assert.ok(Math.abs(actual.x - expected.x) <= 1e-12, `${id} x`);
      assert.ok(Math.abs(actual.y - expected.y) <= 1e-12, `${id} y`);
    }
  }
});

test('unselected phases are preserved and topology/root/order/depths are unchanged', () => {
  const { staged } = layoutFor(f20());
  const view = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  assert.equal(view.staged.rootId, staged.rootId);
  assert.deepEqual([...view.staged.nodes.keys()], [...staged.nodes.keys()]);
  assert.deepEqual([...view.staged.children.keys()], [...staged.children.keys()]);
  for (const id of staged.nodes.keys()) {
    assert.equal(view.staged.nodes.get(id).depth, staged.nodes.get(id).depth);
    assert.deepEqual(view.staged.nodes.get(id).positions.get('start'), staged.nodes.get(id).positions.get('start'));
    assert.deepEqual(view.staged.nodes.get(id).positions.get('end'), staged.nodes.get(id).positions.get('end'));
  }
});

test('repeated focus A -> B -> A agrees with direct base -> A', () => {
  const { staged } = layoutFor(f200());
  const a = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  createFocusView(staged, { focusId: 'n6', phase: 'current' });
  const again = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  for (const id of staged.nodes.keys()) {
    assert.deepEqual(again.staged.nodes.get(id).positions.get('current'), a.staged.nodes.get(id).positions.get('current'));
  }
});

test('invalid IDs, coordinates, and open-disk inputs reject explicitly', () => {
  const { staged } = layoutFor(f20());
  assert.throws(
    () => createFocusView(staged, { focusId: 'missing', phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
  assert.throws(
    () => createFocusView(staged, { focusId: 'n13', phase: 'missing' }),
    (error) => error.code === 'invalid-focus'
  );
  const bad = fakeBase({ current: { theta: 0, rho: 1 }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(bad, { focusId: 'r', phase: 'current' }),
    (error) => error.code === 'focus-disk'
  );
  const nonfinite = fakeBase({ current: { theta: Number.NaN, rho: 0.2 }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(nonfinite, { focusId: 'r', phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
});

test('near-boundary inputs remain finite and open-disk or reject without clamping', () => {
  const near = fakeBase({ current: { theta: 0, rho: 0.9999 }, end: { theta: 0, rho: 0 } });
  try {
    const view = createFocusView(near, { focusId: 'r', phase: 'current' });
    const p = view.staged.nodes.get('r').positions.get('current');
    assert.ok(Number.isFinite(p.theta) && Number.isFinite(p.rho));
    assert.ok(p.rho < 1);
  } catch (error) {
    assert.ok(['focus-disk', 'focus-singular', 'focus-nonfinite', 'focus-center'].includes(error.code));
  }
  const outside = fakeBase({ current: { theta: 0, rho: 1.0001 }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(outside, { focusId: 'r', phase: 'current' }),
    (error) => error.code === 'focus-disk'
  );
});

test('focused scene rebuilds node centers, radii, hyperlines, and hit geometry from transformed positions', () => {
  const { graph, staged } = layoutFor(f20());
  const view = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  const projection = createProjection({ width: 800, height: 600, radius: 100 });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const scene = prepareGraphScene(view.staged, { phase: 'current', projection, nodeDims, nodeKinds });
  for (const [id, node] of scene.nodes) {
    const p = view.staged.nodes.get(id).positions.get('current');
    const center = projection.toCss(p.rho * Math.cos(p.theta), p.rho * Math.sin(p.theta));
    assert.ok(Math.abs(node.center.x - center.x) <= 1e-9);
    assert.ok(Math.abs(node.center.y - center.y) <= 1e-9);
    assert.ok(Math.abs(node.radius - Number(nodeDims.get(id)) * (1 - p.rho * p.rho)) <= 1e-9);
  }
  for (const edge of scene.edges) {
    const from = view.staged.nodes.get(edge.fromId).positions.get('current');
    const expected = projection.toCss(from.rho * Math.cos(from.theta), from.rho * Math.sin(from.theta));
    assert.ok(Math.abs(edge.fromCss.x - expected.x) <= 1e-9);
    assert.ok(Math.abs(edge.fromCss.y - expected.y) <= 1e-9);
  }
  const hit = createHitSnapshot(scene);
  const target = scene.nodes.get('n0');
  assert.equal(hitTestNode(hit, { x: target.center.x, y: target.center.y }), 'n0');
});
test('returned position records and nested staged structures are independently owned', () => {
  const { staged } = layoutFor(f20());
  const view = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  const baseStart = { ...staged.nodes.get('n0').positions.get('start') };
  const baseCurrent = { ...staged.nodes.get('n13').positions.get('current') };
  const baseline = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  const expectedStart = { ...baseline.staged.nodes.get('n0').positions.get('start') };
  const expectedFocused = { ...baseline.staged.nodes.get('n13').positions.get('current') };
  view.staged.nodes.get('n0').positions.get('start').rho = 0.123;
  view.staged.nodes.get('n13').positions.get('current').theta = 1.234;
  assert.deepEqual(staged.nodes.get('n0').positions.get('start'), baseStart);
  assert.deepEqual(staged.nodes.get('n13').positions.get('current'), baseCurrent);

  const other = createFocusView(staged, { focusId: 'n13', phase: 'current' });
  assert.deepEqual(other.staged.nodes.get('n0').positions.get('start'), expectedStart);
  assert.deepEqual(other.staged.nodes.get('n13').positions.get('current'), expectedFocused);

  const node = view.staged.nodes.get('n13');
  assert.notEqual(node.spans, staged.nodes.get('n13').spans);
  assert.notEqual(node.dimQuotients, staged.nodes.get('n13').dimQuotients);
  if (node.angleSpan) assert.notEqual(node.angleSpan, staged.nodes.get('n13').angleSpan);
  node.spans.set('current', 999);
  assert.notEqual(staged.nodes.get('n13').spans.get('current'), 999);
  if (node.dimQuotients) {
    node.dimQuotients.set('current', 999);
    assert.notEqual(staged.nodes.get('n13').dimQuotients.get('current'), 999);
  }
  if (node.angleSpan) {
    node.angleSpan.begin = 999;
    assert.notEqual(staged.nodes.get('n13').angleSpan.begin, 999);
  }
  assert.notEqual(view.staged.depths, staged.depths);
  assert.notEqual(view.staged.scales, staged.scales);
  view.staged.depths.set('n13', 999);
  assert.notEqual(staged.depths.get('n13'), 999);
});

test('Reset returns independently owned positions and validates the reset path', () => {
  const { staged } = layoutFor(f20());
  const before = { ...staged.nodes.get('n0').positions.get('current') };
  const reset = createFocusView(staged, { focusId: null, phase: 'current' });
  reset.staged.nodes.get('n0').positions.get('current').rho = 0.456;
  assert.deepEqual(staged.nodes.get('n0').positions.get('current'), before);

  const invalid = fakeBase({ current: { theta: Number.NaN, rho: 0.2 }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(invalid, { focusId: null, phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
  const outside = fakeBase({ current: { theta: 0, rho: 1 }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(outside, { focusId: null, phase: 'current' }),
    (error) => error.code === 'focus-disk'
  );
  const missing = fakeBase({ current: { theta: 0, rho: 0.2 }, end: { theta: 0, rho: 0 } });
  missing.nodes.get('r').positions.delete('end');
  assert.throws(
    () => createFocusView(missing, { focusId: null, phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
  const infinity = fakeBase({ current: { theta: 0, rho: Infinity }, end: { theta: 0, rho: 0 } });
  assert.throws(
    () => createFocusView(infinity, { focusId: null, phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
  const base = layoutFor(f20()).staged;
  const otherBefore = { ...base.nodes.get('n0').positions.get('end') };
  base.nodes.get('n13').positions.get('current').theta = Number.NaN;
  assert.throws(
    () => createFocusView(base, { focusId: null, phase: 'current' }),
    (error) => error.code === 'invalid-focus'
  );
  assert.deepEqual(base.nodes.get('n0').positions.get('end'), otherBefore);
});

test('baseFocusPosition and focusedPosition distinguish source and measured center', () => {
  const { staged } = layoutFor(f200());
  const focusId = 'n13';
  const source = position(staged, focusId, 'current');
  const view = createFocusView(staged, { focusId, phase: 'current' });
  assert.ok(Math.abs(view.baseFocusPosition.x - source.x) <= 1e-15);
  assert.ok(Math.abs(view.baseFocusPosition.y - source.y) <= 1e-15);
  assert.ok(Math.hypot(view.focusedPosition.x, view.focusedPosition.y) <= FOCUS_CENTER_TOLERANCE);
  assert.ok(view.centerError <= FOCUS_CENTER_TOLERANCE);
  assert.notDeepEqual(view.focusedPosition, view.baseFocusPosition);
  const reset = createFocusView(staged, { focusId: null, phase: 'current' });
  assert.equal(reset.baseFocusPosition, null);
  assert.equal(reset.focusedPosition, null);
  assert.equal(reset.centerError, 0);
});



