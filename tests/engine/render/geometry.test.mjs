import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GraphRenderError,
  hyperlineGeometry,
  nodeBoundary
} from '../../../src/engine/hypertree/render/index.js';
import { legacyHyperlineCommands } from './legacy-hyperline-oracle.mjs';

const TOL = 1e-12;

function close(actual, expected, tolerance = TOL, label = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

test('node boundary transformation preserves legacy CSS radius semantics', () => {
  assert.equal(nodeBoundary({ x: 0, y: 0, dim: 4 }).radius, 4);
  close(nodeBoundary({ x: 0.5, y: 0, dim: 4 }).radius, 3);
  close(nodeBoundary({ x: 0.9, y: 0, dim: 4 }).radius, 0.76);
  assert.equal(nodeBoundary({ x: 1, y: 0, dim: 4 }).radius, 0);
  assert.equal(nodeBoundary({ x: 0.9, y: 0, dim: 4, transform: false }).radius, 4);
  assert.throws(() => nodeBoundary({ x: 0, y: 0, dim: -1 }), (e) => e.code === 'invalid-number');
});

test('ordinary hyperline arc matches actual legacy EdgeHelper command geometry', () => {
  const from = { x: 0.3, y: 0.2 };
  const to = { x: -0.2, y: 0.5 };
  const radius = 100;
  const geometry = hyperlineGeometry(from, to);
  assert.equal(geometry.kind, 'arc');
  const commands = legacyHyperlineCommands(from, to, radius);
  const arc = commands.find((c) => c[0] === 'arc');
  assert.ok(arc, 'legacy arc command');
  close(arc[1], geometry.center.x * radius, 1e-9, 'legacy center x');
  close(arc[2], geometry.center.y * radius, 1e-9, 'legacy center y');
  close(arc[3], geometry.radius * radius, 1e-9, 'legacy radius');
  close(arc[4], geometry.startAngle, 1e-12, 'start angle');
  close(arc[5], geometry.endAngle, 1e-12, 'end angle');
  assert.equal(arc[6], geometry.sense);
});

test('root-connected and coincident edges use straight fallback', () => {
  const rootEdge = hyperlineGeometry({ x: 0, y: 0 }, { x: 0.4, y: 0.2 });
  assert.equal(rootEdge.kind, 'line');
  assert.equal(rootEdge.fallback, 'collinear');

  const coincident = hyperlineGeometry({ x: 0.25, y: -0.1 }, { x: 0.25, y: -0.1 });
  assert.equal(coincident.kind, 'line');
  assert.equal(coincident.fallback, 'coincident');

  const actual = legacyHyperlineCommands({ x: 0, y: 0 }, { x: 0.4, y: 0.2 }, 100);
  assert.deepEqual(actual[1], ['moveTo', 0, 0]);
  assert.deepEqual(actual[2], ['lineTo', 40, 20]);
});

test('near-collinear and oversized arcs use documented straight fallback', () => {
  const near = hyperlineGeometry({ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.400000000001 });
  assert.equal(near.kind, 'line');
  assert.equal(near.fallback, 'collinear');

  const oversized = hyperlineGeometry(
    { x: 0.999999999, y: 0.000000001 },
    { x: 0.999999998, y: 0.000000002 },
    { maxArcRatio: 1 }
  );
  assert.equal(oversized.kind, 'line');
  assert.ok(['oversize', 'degenerate-arc'].includes(oversized.fallback));
});

test('arc endpoints and orthogonality hold within declared tolerance', () => {
  const points = [
    [{ x: 0.3, y: 0.2 }, { x: -0.2, y: 0.5 }],
    [{ x: 0.1, y: -0.4 }, { x: 0.6, y: 0.2 }],
    [{ x: -0.7, y: 0.1 }, { x: 0.2, y: 0.6 }]
  ];
  for (const [from, to] of points) {
    const g = hyperlineGeometry(from, to);
    assert.equal(g.kind, 'arc');
    for (const point of [from, to]) {
      const distance = Math.hypot(point.x - g.center.x, point.y - g.center.y);
      close(distance, g.radius, 1e-12, 'arc endpoint radius');
    }
    close(g.center.x * g.center.x + g.center.y * g.center.y - g.radius * g.radius, 1, 1e-12, 'orthogonality');
  }
});

test('invalid points and non-finite coordinates are rejected', () => {
  assert.throws(() => hyperlineGeometry({ x: Number.NaN, y: 0 }, { x: 0, y: 0 }), (e) => e.code === 'invalid-number');
  assert.throws(() => hyperlineGeometry({ x: 0, y: 0 }, { x: 0, y: Infinity }), (e) => e.code === 'invalid-number');
  assert.throws(() => nodeBoundary({ x: Number.NaN, y: 0, dim: 1 }), (e) => e.code === 'invalid-number');
  assert.throws(() => hyperlineGeometry(null, { x: 0, y: 0 }), (e) => e instanceof GraphRenderError && e.code === 'invalid-point');
});


