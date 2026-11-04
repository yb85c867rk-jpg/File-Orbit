import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, handleExplorationCanvasClick, stageExplorationFrame } from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, createCamera, createMouseNavigationController } from '../../../src/engine/hypertree/navigation/index.js';
import { f20 } from '../layout/fixtures.mjs';

const viewport = { width: 1100, height: 473 };
class Canvas {
  constructor(throwRect = false) { this.throwRect = throwRect; this.clientLeft = 0; this.clientTop = 0; }
  getBoundingClientRect() { if (this.throwRect) throw new Error('rect-failed'); return { left: 0, top: 0 }; }
}
function setup(overrides = {}) {
  const tree = f20();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  const ctx = { graph, baseLayout, model, frameState: null, diagnostics: [], failFrame: false };
  const session = createExplorationSession({
    model,
    initialCamera: createCamera({ zoom: 1, panX: 0, panY: 0 }, EXPERIMENTAL_CAMERA_LIMITS),
    limits: EXPERIMENTAL_CAMERA_LIMITS,
    invalidate: () => { ctx.frameState = null; },
    publish: () => {},
    frame: ({ fit, entry, camera, framing }) => {
      if (ctx.failFrame) throw new Error('frame-install-failed');
      const prepared = stageExplorationFrame({
        graph, baseLayout, view: model.view(), viewport, padding: 24, baseRadiusCss: 198.66,
        fit, entry, camera, framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
        adapters: { draw: () => {}, labels: overrides.labels || (() => {}), installHit: () => {} }
      });
      ctx.frameState = { hit: prepared.hit, scene: prepared.scene, camera: prepared.camera, framing: prepared.framing };
      return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit };
    }
  });
  session.run('initial', () => ({ ok: true, fit: true }), { fit: false });
  return { ctx, session };
}
function click(ctx, session, id, canvas = new Canvas(), extra = {}) {
  let point;
  if (id === null) point = { x: -100, y: -100 };
  else {
    const node = ctx.frameState.hit.nodes.find((item) => item.id === id);
    assert.ok(node, `hit node ${id}`);
    point = node.center;
  }
  return handleExplorationCanvasClick({
    event: { button: 0, clientX: point.x, clientY: point.y, isPrimary: false, ...extra },
    canvas,
    frameState: ctx.frameState,
    session,
    model: ctx.model,
    graph: ctx.graph,
    onDiagnostic: (diagnostic) => ctx.diagnostics.push(diagnostic)
  });
}

test('ordinary left click enters an off-center child folder without pointer-stream metadata', () => {
  const { ctx, session } = setup();
  const result = click(ctx, session, 'n1');
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'folder-entered');
  assert.equal(ctx.model.focusedFolderId, 'n1');
  assert.equal(ctx.frameState.scene.nodes.has('n0'), true);
  assert.equal(ctx.frameState.scene.nodes.has('n2'), true);
  assert.equal(ctx.frameState.scene.nodes.get('n0').radius, 12);
});

test('current-folder click is idempotent and preserves manual camera', () => {
  const { ctx, session } = setup();
  click(ctx, session, 'n1');
  const camera = createCamera({ zoom: 1.2, panX: 7, panY: 9 }, EXPERIMENTAL_CAMERA_LIMITS);
  session.applyCamera(camera, { kind: 'wheel' });
  const result = click(ctx, session, 'n1');
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(ctx.model.focusedFolderId, 'n1');
  assert.deepEqual(session.getState().camera, camera);
});

test('data circles select details; folder click and background clear remain functional', () => {
  const { ctx, session } = setup();
  click(ctx, session, 'n1');
  assert.equal(click(ctx, session, 'n15').reason, 'file-selected');
  assert.equal(ctx.model.selectedId, 'n15');
  assert.equal(ctx.model.focusedFolderId, 'n1');
  const background = click(ctx, session, null);
  assert.equal(background.ok, true);
  assert.equal(background.reason, 'background-miss');
  assert.equal(ctx.model.focusedFolderId, 'n1');
  assert.equal(ctx.model.selectedId, null);
});

test('coordinate and frame-installation failures return bounded diagnostics and stay inert', () => {
  const { ctx, session } = setup();
  const coordinate = handleExplorationCanvasClick({
    event: { button: 0, clientX: 1, clientY: 1 },
    canvas: new Canvas(true), frameState: ctx.frameState, session, model: ctx.model, graph: ctx.graph,
    onDiagnostic: (diagnostic) => ctx.diagnostics.push(diagnostic)
  });
  assert.equal(coordinate.ok, false);
  assert.equal(coordinate.reason, 'coordinate-error');
  assert.equal(ctx.diagnostics.at(-1).reason, 'coordinate-error');

  ctx.failFrame = true;
  const failed = click(ctx, session, 'n1');
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'enter-folder-failed');
  assert.equal(ctx.model.focusedFolderId, 'n0');
  assert.equal(ctx.frameState, null);
  const later = handleExplorationCanvasClick({
    event: { button: 0, clientX: 0, clientY: 0 }, canvas: new Canvas(), frameState: null,
    session, model: ctx.model, graph: ctx.graph, onDiagnostic: () => {}
  });
  assert.equal(later.ok, false);
  assert.equal(later.reason, 'frame-not-ready');
});
test('controller suppresses post-drag click and replacement canvas receives click listeners', () => {
  class ClickCanvas extends EventTarget {
    constructor() { super(); this.captured = null; this.clientLeft = 0; this.clientTop = 0; this.clicks = 0; }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    setPointerCapture(id) { this.captured = id; }
    releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
  }
  const ev = (type, props) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, ...props });
    return event;
  };
  const canvas = new ClickCanvas();
  const controller = createMouseNavigationController(canvas, {
    camera: { zoom: 0.2, panX: 0, panY: 0 }, viewport: { width: 200, height: 150 },
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, onCameraChange: () => true
  });
  canvas.addEventListener('click', () => { canvas.clicks += 1; });
  canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(ev('pointermove', { clientX: 40, clientY: 30 }));
  canvas.dispatchEvent(ev('pointerup', { clientX: 40, clientY: 30 }));
  canvas.dispatchEvent(ev('click', { clientX: 40, clientY: 30 }));
  assert.equal(canvas.clicks, 0);
  controller.destroy();
  const replacement = new ClickCanvas();
  replacement.addEventListener('click', () => { replacement.clicks += 1; });
  replacement.dispatchEvent(ev('click', { clientX: 20, clientY: 20 }));
  assert.equal(replacement.clicks, 1);
});





