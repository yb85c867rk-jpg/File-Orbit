import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createFocusView,
  focusParameter,
  createFocusViewAtParameter
} from '../../../src/engine/hypertree/focus/index.js';
import {
  easeInOutCubic,
  sampleFocusTransition
} from '../../../src/engine/hypertree/focus/focus-transition.js';
import { f20, f200 } from '../layout/fixtures.mjs';

function setup() {
  const { graph } = loadTree(f20());
  const base = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  return base;
}

function jsonPosition(view, id) {
  return view.staged.nodes.get(id).positions.get('current');
}

test('easing and progress clamping are deterministic', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(easeInOutCubic(0.25) < 0.5);
  const base = setup();
  assert.equal(sampleFocusTransition(base, { focusId: 'n13', progress: -2 }).progress, 0);
  assert.equal(sampleFocusTransition(base, { focusId: 'n13', progress: 2 }).progress, 1);
  assert.throws(
    () => sampleFocusTransition(base, { focusId: 'n13', progress: Number.NaN }),
    (error) => error.code === 'invalid-progress'
  );
});

test('endpoints exactly equal the accepted immediate-focus views', () => {
  const base = setup();
  const target = createFocusView(base, { focusId: 'n13', phase: 'current' });
  const parameter = focusParameter(base, 'n13', 'current');
  const start = sampleFocusTransition(base, { focusId: 'n13', progress: 0 });
  const end = sampleFocusTransition(base, { focusId: 'n13', progress: 1 });
  assert.equal(start.progress, 0);
  assert.equal(end.progress, 1);
  assert.deepEqual(end.parameter, parameter);
  for (const id of base.nodes.keys()) {
    assert.deepEqual(end.view.staged.nodes.get(id).positions.get('current'),
      target.staged.nodes.get(id).positions.get('current'));
    assert.deepEqual(start.view.staged.nodes.get(id).positions.get('current'),
      base.nodes.get(id).positions.get('current'));
  }
  assert.ok(end.view.centerError <= 1e-12);
});

test('intermediate frames are coherent parameter transforms and do not accumulate', () => {
  const base = setup();
  const before = new Map([...base.nodes].map(([id, node]) => [id, { ...node.positions.get('current') }]));
  const half = sampleFocusTransition(base, {
    focusId: 'n13',
    fromParameter: focusParameter(base, 'n6', 'current'),
    progress: 0.35
  });
  const direct = createFocusViewAtParameter(base, {
    focusId: 'n13',
    phase: 'current',
    parameter: half.parameter
  });
  for (const id of base.nodes.keys()) {
    assert.deepEqual(half.view.staged.nodes.get(id).positions.get('current'),
      direct.staged.nodes.get(id).positions.get('current'));
  }
  for (const [id, position] of before) {
    assert.deepEqual(base.nodes.get(id).positions.get('current'), position);
  }
  // Sampling again from base at a later progress does not depend on the prior sample.
  const late = sampleFocusTransition(base, { focusId: 'n13', progress: 0.8 });
  const lateDirect = sampleFocusTransition(base, { focusId: 'n13', progress: 0.8 });
  assert.deepEqual(late.parameter, lateDirect.parameter);
});

test('F20/F200 transitions remain finite/open-disk and preserve ownership', () => {
  for (const tree of [f20(), f200()]) {
    const { graph } = loadTree(tree);
    const base = computeRadialLayout(graph, {
      rootId: 'n0',
      phases: ['current', 'start', 'end'],
      nodeOptions: { overridable: true },
      radius: 100,
      offset: 0.1
    });
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      const sample = sampleFocusTransition(base, { focusId: 'n13', progress });
      for (const node of sample.view.staged.nodes.values()) {
        const p = node.positions.get('current');
        assert.ok(Number.isFinite(p.theta) && Number.isFinite(p.rho));
        assert.ok(p.rho < 1);
      }
    }
    const first = sampleFocusTransition(base, { focusId: 'n6', progress: 0.4 });
    const second = sampleFocusTransition(base, { focusId: 'n13', progress: 0.7 });
    assert.notDeepEqual(first.parameter, second.parameter);
    assert.equal(base.rootId, 'n0');
  }
});
