import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, prepareExplorationFrame, stageExplorationFrame } from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, createCamera, createMouseNavigationController } from '../../../src/engine/hypertree/navigation/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
const options = { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' };
function setup(make = f20) {
  const tree = make();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, options).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  return { graph, baseLayout, model };
}
function makeSession(ctx, overrides = {}) {
  const camera = createCamera({ zoom: 1, panX: 0, panY: 0 }, EXPERIMENTAL_CAMERA_LIMITS);
  const events = [];
  const session = createExplorationSession({
    model: ctx.model,
    initialCamera: camera,
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    invalidate: () => { ctx.hit = null; },
    publish: (state) => events.push(state),
    frame: ({ fit, entry, camera: cam, framing }) => {
      if (overrides.prepare) throw new Error('prepare-failed');
      const prepared = stageExplorationFrame({
        ...options,
        baseRadiusCss: 198.66,
        graph: ctx.graph,
        baseLayout: ctx.baseLayout,
        view: ctx.model.view(),
        fit, entry, camera: cam, framing,
        cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
        adapters: {
          draw: overrides.draw || (() => {}),
          labels: overrides.labels || (() => {}),
          installHit: overrides.installHit || ((hit) => { ctx.hit = hit; })
        }
      });
      return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
    }
  });
  return { session, events };
}

test('session initial overview, folder click, nested parent, root, and idempotent current folder', () => {
  const ctx = setup();
  const { session, events } = makeSession(ctx);
  const initial = session.run('initial-overview', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'programmatic' });
  assert.equal(initial.ok, true);
  assert.equal(ctx.hit.nodes.length, 20);
  assert.equal(session.getState().installing, false);
  assert.equal(events.at(-1).installing, false);
  session.run('enter-n1', () => ({ ...ctx.model.enterFolder('n1'), fit: true }), { fit: false, eventKind: 'user' });
  assert.equal(ctx.hit.nodes.length, 14);
  const manual = createCamera({ zoom: 1.25, panX: 3, panY: 4 }, EXPERIMENTAL_CAMERA_LIMITS);
  session.applyCamera(manual, { kind: 'wheel' });
  session.run('same-n1', () => ({ ...ctx.model.enterFolder('n1'), fit: false }), { fit: false, eventKind: 'user' });
  assert.deepEqual(session.getState().camera, manual);
  session.run('enter-n3', () => ({ ...ctx.model.enterFolder('n3'), fit: true }), { fit: false, eventKind: 'user' });
  assert.equal(ctx.model.view().visibleSet.has('n1'), true);
  session.run('enter-n1', () => ({ ...ctx.model.enterFolder('n1'), fit: true }), { fit: false, eventKind: 'user' });
  assert.equal(ctx.model.view().visibleSet.has('n4'), true);
  session.run('n0', () => ({ ...ctx.model.enterFolder('n0'), fit: true }), { fit: false, eventKind: 'user' });
  assert.equal(ctx.hit.nodes.length, 20);
});

test('file selection and programmatic restoration do not navigate', () => {
  const ctx = setup();
  const { session, events } = makeSession(ctx);
  session.run('initial', () => ({ ok: true, fit: true }), { fit: false });
  session.run('n1', () => ({ ...ctx.model.enterFolder('n1'), fit: true }), { fit: false });
  const focused = ctx.model.view().focusedFolderId;
  const selected = session.run('file', () => ({ ...ctx.model.select('n15'), fit: false }), { fit: false, eventKind: 'user' });
  assert.equal(selected.ok, true);
  assert.equal(ctx.model.view().focusedFolderId, focused);
  assert.equal(ctx.model.selectedId, 'n15');
  assert.equal(events.at(-1).lastEvent.operation, 'file');
  ctx.model.restoreSelection('n15');
  assert.equal(ctx.model.view().focusedFolderId, focused);
});

test('draw, label, and hit failures leave interaction inert and publish failure', () => {
  for (const stage of ['prepare', 'draw', 'labels', 'installHit']) {
    const ctx = setup();
    const { session, events } = makeSession(ctx, { [stage]: () => { throw new Error(`${stage}-failed`); } });
    session.run('initial', () => ({ ok: true, fit: true }), { fit: false });
    const result = session.run('enter-failed', () => ({ ...ctx.model.enterFolder('n1'), fit: true }), { fit: false, eventKind: 'user' });
    assert.equal(result.ok, false);
    assert.equal(ctx.hit, null);
    assert.equal(session.getState().hitActive, false);
    assert.equal(session.getState().installing, false);
    assert.match(events.at(-1).error.message, new RegExp(`${stage}-failed`));
    assert.equal(events.at(-1).lastEvent.success, false);
    assert.equal(ctx.model.view().focusedFolderId, 'n0');
  }
});

test('final centered fit is contained, depth-sized, and focused folder stays centered', () => {
  const ctx = setup();
  const prepared = prepareExplorationFrame({
    ...options, baseRadiusCss: 198.66, graph: ctx.graph, baseLayout: ctx.baseLayout,
    view: ctx.model.view(), fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  });
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  const focused = prepared.scene.nodes.get('n0');
  assert.ok(Math.hypot(focused.center.x - center.x, focused.center.y - center.y) < 1e-6);
  assert.equal(prepared.containment.contained, true);
  assert.equal(focused.radius, 12);
  const depth1 = [...prepared.scene.nodes.values()].find((node) => node.kind === 'folder' && node.id !== 'n0' && ctx.baseLayout.depths.get(node.id) === 1);
  assert.equal(depth1.radius, 9.6);
  assert.ok(prepared.hit.nodes.every((node) => node.radius === prepared.scene.nodes.get(node.id).radius));
});

class FakeCanvas extends EventTarget {
  constructor() { super(); this.captured = null; this.clientLeft = 0; this.clientTop = 0; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
}
function pointer(type, props) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, ...props });
  return event;
}
function wheel(props) {
  const event = new Event('wheel', { cancelable: true });
  Object.assign(event, { deltaMode: 0, ctrlKey: false, metaKey: false, ...props });
  return event;
}

test('controller preserves experimental limits and handles wheel/drag, destroy/recreate', () => {
  const canvas = new FakeCanvas();
  let camera = { zoom: 0.2, panX: 0, panY: 0 };
  let changes = 0;
  const controller = createMouseNavigationController(canvas, {
    camera, viewport: { width: 200, height: 150 }, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    onCameraChange: (next) => { camera = next; changes += 1; return true; }
  });
  canvas.dispatchEvent(wheel({ deltaY: -120, clientX: 100, clientY: 75 }));
  assert.ok(camera.zoom > 0.2);
  canvas.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 30 }));
  canvas.dispatchEvent(pointer('pointerup', { clientX: 40, clientY: 30 }));
  assert.equal(changes, 2);
  assert.equal(controller.getState().dragging, false);
  assert.equal(canvas.captured, null);
  controller.destroy();
  const second = new FakeCanvas();
  const two = createMouseNavigationController(second, {
    camera: { zoom: 0.2, panX: 0, panY: 0 }, viewport: { width: 200, height: 150 },
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, onCameraChange: () => true
  });
  assert.equal(two.getState().camera.zoom, 0.2);
  two.destroy();
});
test('centered fit can use experimental zoom below .25', () => {
  const ctx = setup(f200);
  const prepared = prepareExplorationFrame({
    ...options, baseRadiusCss: 198.66, graph: ctx.graph, baseLayout: ctx.baseLayout,
    view: ctx.model.view(), fit: true, camera: null, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS
  });
  assert.ok(prepared.camera.zoom < 0.25);
  assert.equal(prepared.containment.contained, true);
});




