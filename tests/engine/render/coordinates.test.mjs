import test from 'node:test';
import assert from 'node:assert/strict';

import { createProjection } from '../../../src/engine/hypertree/render/index.js';

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
}

test('projection maps normalized Cartesian to centered CSS with y down', () => {
  const p = createProjection({ width: 800, height: 600, radius: 100 });
  assert.deepEqual([p.centerX, p.centerY, p.radius], [400, 300, 100]);
  assert.deepEqual(p.toCss(0, 0), { x: 400, y: 300 });
  assert.deepEqual(p.toCss(1, 0), { x: 500, y: 300 });
  assert.deepEqual(p.toCss(0, 1), { x: 400, y: 400 });
  assert.deepEqual(p.toCss(-1, -1), { x: 300, y: 200 });
});

test('projection/inverse round trips and client coordinates', () => {
  const p = createProjection({ width: 801, height: 599, radius: 123.5 });
  for (const [x, y] of [[0, 0], [1, 0], [0.3, -0.7], [-2.5, 1.25]]) {
    const css = p.toCss(x, y);
    const back = p.fromCss(css.x, css.y);
    close(back.x, x);
    close(back.y, y);
  }
  const css = p.toCss(0.25, -0.5);
  const client = p.toClient(css, { left: 10, top: 20 });
  assert.deepEqual(client, { x: css.x + 10, y: css.y + 20 });
  assert.deepEqual(p.fromClient(client, { left: 10, top: 20 }), css);
});

test('zero-size projection has no division by zero and keeps radius semantics', () => {
  const p = createProjection({ width: 0, height: 0, radius: 50 });
  assert.deepEqual(p.toCss(1, -1), { x: 50, y: -50 });
  assert.deepEqual(p.fromCss(0, 0), { x: 0, y: 0 });
});

test('projection rejects invalid dimensions/radius and non-finite coordinates', () => {
  assert.throws(() => createProjection({ width: 1, height: 1, radius: 0 }), RangeError);
  assert.throws(() => createProjection({ width: -1, height: 1, radius: 1 }), RangeError);
  assert.throws(() => createProjection({ width: Number.NaN, height: 1, radius: 1 }), TypeError);
  const p = createProjection({ width: 10, height: 10, radius: 1 });
  assert.throws(() => p.toCss(Number.NaN, 0), TypeError);
  assert.throws(() => p.fromCss(Infinity, 0), TypeError);
  assert.throws(() => p.toClient({ x: 0, y: 0 }, { left: Number.NaN, top: 0 }), TypeError);
});
