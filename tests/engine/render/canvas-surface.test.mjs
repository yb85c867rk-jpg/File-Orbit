import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanvasSurface,
  CanvasSurfaceError,
  SURFACE_LIMITS
} from '../../../src/engine/hypertree/render/index.js';

function makeHost(options = {}) {
  const children = [];
  const contexts = [];
  const host = {
    ownerDocument: null,
    appendChild(child) {
      children.push(child);
      child.parentNode = host;
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      child.parentNode = null;
      return child;
    }
  };
  const doc = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        tagName: 'CANVAS',
        style: {},
        width: 0,
        height: 0,
        parentNode: null,
        getContext(type) {
          assert.equal(type, '2d');
          if (options.context === 'null') return null;
          if (options.context === 'throw') throw new Error('context failure');
          const calls = [];
          const ctx = {
            calls,
            canvas,
            transform: [1, 0, 0, 1, 0, 0],
            setTransform(a, b, c, d, e, f) {
              if (options.transformThrows && calls.filter((c) => c[0] === 'setTransform').length === 0) {
                throw new Error('transform failure');
              }
              this.transform = [a, b, c, d, e, f];
              calls.push(['setTransform', a, b, c, d, e, f]);
            },
            clearRect(x, y, w, h) {
              calls.push(['clearRect', x, y, w, h]);
            }
          };
          contexts.push(ctx);
          return ctx;
        }
      };
      return canvas;
    }
  };
  host.ownerDocument = doc;
  return { host, children, contexts };
}

test('DPR 1, 1.25, 2, 3 sizes and integer backing stores', () => {
  for (const [dpr, bw, bh] of [[1, 100, 60], [1.25, 125, 75], [2, 200, 120], [3, 300, 180]]) {
    const { host } = makeHost();
    const surface = createCanvasSurface(host, { width: 100, height: 60, dpr });
    const metrics = surface.getMetrics();
    assert.deepEqual(
      [metrics.cssWidth, metrics.cssHeight, metrics.dpr, metrics.backingWidth, metrics.backingHeight],
      [100, 60, dpr, bw, bh]
    );
    assert.equal(surface.canvas.width, bw);
    assert.equal(surface.canvas.height, bh);
    assert.equal(surface.canvas.style.width, '100px');
    assert.equal(surface.canvas.style.height, '60px');
    surface.destroy();
  }
});

test('fractional CSS size rounds backing dimensions and uses effective scale', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 100.5, height: 50.5, dpr: 1.25 });
  const m = surface.getMetrics();
  assert.equal(m.backingWidth, 126);
  assert.equal(m.backingHeight, 63);
  assert.equal(m.scaleX, 126 / 100.5);
  assert.equal(m.scaleY, 63 / 50.5);
  const last = contexts[0].calls.filter((c) => c[0] === 'setTransform').at(-1);
  assert.deepEqual(last, ['setTransform', m.scaleX, 0, 0, m.scaleY, 0, 0]);
  surface.destroy();
});

test('repeated resize does not accumulate transforms', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 100, height: 100, dpr: 1 });
  surface.resize({ width: 200, height: 80, dpr: 2 });
  surface.resize({ width: 200, height: 80, dpr: 2 });
  surface.resize({ width: 100, height: 60, dpr: 1.5 });
  const calls = contexts[0].calls.filter((c) => c[0] === 'setTransform');
  assert.deepEqual(calls.at(-1), ['setTransform', 1.5, 0, 0, 1.5, 0, 0]);
  surface.destroy();
});

test('same CSS size with changed DPR updates backing and transform', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 100, height: 50, dpr: 1 });
  surface.resize({ width: 100, height: 50, dpr: 2 });
  assert.deepEqual(
    [surface.canvas.width, surface.canvas.height, surface.getMetrics().dpr],
    [200, 100, 2]
  );
  assert.deepEqual(
    contexts[0].calls.filter((c) => c[0] === 'setTransform').at(-1),
    ['setTransform', 2, 0, 0, 2, 0, 0]
  );
  surface.destroy();
});

test('clear wipes the full backing store and restores the documented transform', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 100.25, height: 50.5, dpr: 2 });
  const m = surface.getMetrics();
  const ctx = contexts[0];
  ctx.setTransform(9, 0, 0, 9, 7, 8);
  surface.clear();
  assert.deepEqual(ctx.calls.filter((c) => c[0] === 'clearRect').at(-1), [
    'clearRect', 0, 0, m.backingWidth, m.backingHeight
  ]);
  const transforms = ctx.calls.filter((c) => c[0] === 'setTransform');
  assert.deepEqual(transforms.at(-2), ['setTransform', 1, 0, 0, 1, 0, 0]);
  assert.deepEqual(transforms.at(-1), ['setTransform', m.scaleX, 0, 0, m.scaleY, 0, 0]);
  surface.destroy();
});

test('invalid and oversize resize leave prior surface state unchanged', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 100, height: 60, dpr: 1 });
  const before = surface.getMetrics();
  const canvas = surface.canvas;
  const attrs = [canvas.width, canvas.height, canvas.style.width, canvas.style.height];
  const calls = contexts[0].calls.length;
  for (const bad of [
    { width: Number.NaN, height: 60, dpr: 1 },
    { width: -1, height: 60, dpr: 1 },
    { width: 100, height: 60, dpr: 0 },
    { width: SURFACE_LIMITS.maxCssSide + 1, height: 60, dpr: 1 },
    { width: 100, height: 60, dpr: 10_000 }
  ]) {
    assert.throws(() => surface.resize(bad), (e) => e instanceof CanvasSurfaceError);
  }
  assert.deepEqual(surface.getMetrics(), before);
  assert.deepEqual([canvas.width, canvas.height, canvas.style.width, canvas.style.height], attrs);
  assert.equal(contexts[0].calls.length, calls);
  surface.destroy();
});

test('zero-size surface is well-defined and does not divide by zero', () => {
  const { host, contexts } = makeHost();
  const surface = createCanvasSurface(host, { width: 0, height: 0, dpr: 2 });
  const m = surface.getMetrics();
  assert.deepEqual(
    [m.backingWidth, m.backingHeight, m.scaleX, m.scaleY],
    [0, 0, 0, 0]
  );
  surface.clear();
  assert.deepEqual(contexts[0].calls.filter((c) => c[0] === 'clearRect').at(-1), [
    'clearRect', 0, 0, 0, 0
  ]);
  surface.destroy();
});

test('context/initialization failure removes the created canvas', () => {
  for (const mode of ['null', 'throw', 'transform']) {
    const { host, children } = makeHost({
      context: mode === 'null' ? 'null' : mode === 'throw' ? 'throw' : undefined,
      transformThrows: mode === 'transform'
    });
    assert.throws(
      () => createCanvasSurface(host, { width: 100, height: 60, dpr: 1 }),
      (e) => e instanceof CanvasSurfaceError
    );
    assert.equal(children.length, 0);
  }
});

test('independent instances and idempotent destroy preserve other children', () => {
  const { host, children } = makeHost();
  const callerChild = { parentNode: null };
  host.appendChild(callerChild);
  const first = createCanvasSurface(host, { width: 100, height: 60, dpr: 1 });
  const second = createCanvasSurface(host, { width: 80, height: 40, dpr: 2 });
  assert.equal(children.length, 3);
  first.destroy();
  assert.equal(children.length, 2);
  assert.equal(children.includes(callerChild), true);
  assert.equal(children.includes(second.canvas), true);
  first.destroy();
  assert.equal(children.length, 2);
  assert.throws(() => first.getMetrics(), (e) => e.code === 'destroyed');
  assert.throws(() => first.clear(), (e) => e.code === 'destroyed');
  assert.throws(() => first.resize({ width: 1, height: 1, dpr: 1 }), (e) => e.code === 'destroyed');
  second.destroy();
  assert.equal(children.length, 1);
  assert.equal(children[0], callerChild);
});
