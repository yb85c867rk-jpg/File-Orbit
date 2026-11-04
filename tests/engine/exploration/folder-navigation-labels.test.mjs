import test from 'node:test';
import assert from 'node:assert/strict';
import { f20 } from '../layout/fixtures.mjs';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, createExplorationNavigator } from '../../../src/engine/hypertree/exploration/index.js';
import { prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/frame.js';
import { createLabelOverlay } from '../../../src/engine/hypertree/render/index.js';
import { finalizeTransitionNavigation } from '../../../src/engine/hypertree/exploration/navigation-cleanup.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';

class FakeElement {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.parentNode = null; this.style = {}; this.attributes = new Map(); this._text = ''; this.offsetWidth = 0; this.offsetHeight = 0; }
  set innerHTML(value) { throw new Error('innerHTML must not be used'); }
  set textContent(value) { this._text = String(value); this.offsetWidth = Math.min(180, Math.max(20, this._text.length * 7)); this.offsetHeight = 16; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener() {}
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  getBoundingClientRect() {
    const left = Number.parseFloat(this.style.left) || 0;
    const top = Number.parseFloat(this.style.top) || 0;
    const rect = (width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
    if (this.tagName === 'svg') return { width: 12, height: 12 };
    if (this.attributes.has('data-vd-label-id')) return rect(40, 16);
    if (this.children.length > 0) return rect(80, 16);
    return rect(this.offsetWidth, this.offsetHeight);
  }
}
function fakeHost(width, height) {
  const doc = {
    createElement(tag) { return new FakeElement(doc, tag); },
    createElementNS(_ns, tag) { const el = new FakeElement(doc, tag); if (tag === 'svg') { el.offsetWidth = 12; el.offsetHeight = 12; } return el; }
  };
  const host = { ownerDocument: doc, children: [], clientWidth: width, clientHeight: height,
    appendChild(child) { child.parentNode = host; host.children.push(child); return child; },
    removeChild(child) { const i = host.children.indexOf(child); if (i >= 0) host.children.splice(i, 1); child.parentNode = null; return child; } };
  return { doc, host };
}
function presentationFor(scene) {
  return new Map([...scene.nodes].map(([id, node]) => [id, { name: id, kind: node.kind, depth: node.depth }]));
}
function scheduler() {
  let now = 0; let next = 1; const pending = new Map();
  return {
    now: () => now,
    requestFrame: (callback) => { const id = next++; pending.set(id, callback); return id; },
    cancelFrame: (id) => pending.delete(id),
    step(ms = 20) { now += ms; const entries = [...pending.entries()]; pending.clear(); for (const [, callback] of entries) callback(now); },
    get size() { return pending.size; }
  };
}
function run(viewport) {
  const tree = f20(); const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: Math.min(viewport.width, viewport.height) * 0.42 }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  const { host } = fakeHost(viewport.width, viewport.height);
  const overlay = createLabelOverlay(host);
  let transitionLabels = false;
  const calls = { begin: 0, update: 0, complete: 0, start: 0, frames: 0, settled: 0, restored: 0, errors: 0 };
  const frame = (args) => {
    const prepared = prepareExplorationFrame({ graph, baseLayout, view: args.entry?.view || model.view(), viewport, baseRadiusCss: Math.min(viewport.width, viewport.height) * 0.42, fit: args.fit, camera: args.camera, framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
    const input = { scene: prepared.scene, presentation: presentationFor(prepared.scene), priorityIds: [] };
    if (transitionLabels) { calls.complete += 1; overlay.completeTransition(input); transitionLabels = false; }
    else overlay.update(input);
    return { camera: prepared.camera, framing: args.framing, scene: prepared.scene, filtered: prepared.filtered, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({ model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  const clock = scheduler();
  const nav = createExplorationNavigator({
    graph, baseLayout, model, session, viewport, baseRadiusCss: Math.min(viewport.width, viewport.height) * 0.42,
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, duration: 780,
    transitionOptions: { now: clock.now, requestFrame: clock.requestFrame, cancelFrame: clock.cancelFrame },
    draw: () => {},
    labels: (scene) => {
      const input = { scene, presentation: presentationFor(scene), priorityIds: [] };
      if (!transitionLabels) { transitionLabels = true; calls.begin += 1; return overlay.beginTransition(input); }
      calls.update += 1; return overlay.updateTransition(input);
    },
    onStart: () => { calls.start += 1; },
    onFrame: () => { calls.frames += 1; },
    onError: () => { calls.errors += 1; calls.restored += 1; },
    onSettled: () => { calls.settled += 1; calls.restored += 1; }
  });
  const result = nav.enterFolder('n6');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mode, 'transition');
  assert.equal(calls.start, 1);
  clock.step(100);
  while (clock.size > 0 && model.focusedFolderId !== 'n6') clock.step(100);
  assert.equal(model.focusedFolderId, 'n6', 'focus');
  assert.equal(calls.begin, 1, 'begin');
  assert.ok(calls.update > 0, 'updates');
  assert.equal(calls.complete, 1, 'complete');
  assert.equal(calls.settled, 1, 'settled');
  assert.equal(calls.restored, 1, 'restored');
  assert.equal(nav.busy, false);
  assert.ok(overlay.getMetrics().labels.size > 0, 'labels');
}
test('real label overlay lifecycle across F20 n6 navigation at 874x622', () => { run({ width: 874, height: 622 }); });
test('real label overlay lifecycle across F20 n6 navigation at 1100x473', () => { run({ width: 1100, height: 473 }); });
test('cleanup failure preserves navigation error and restores only after coherent recovery', () => {
  let restored = 0; let suspended = 0;
  const overlay = { cancelTransition() { throw new Error('cleanup exploded'); } };
  let recoveryRuns = 0;
  const session = { run() { recoveryRuns += 1; return { ok: true }; } };
  const outcome = finalizeTransitionNavigation({ overlay, transitionLabels: true, session, error: new Error('navigation exploded'), restoreNavigation: () => { restored += 1; }, suspendNavigation: () => { suspended += 1; } });
  assert.equal(outcome.originalError, 'navigation exploded');
  assert.equal(outcome.cleanupError, 'cleanup exploded');
  assert.equal(outcome.recovered, true);
  assert.equal(restored, 1);
  assert.equal(suspended, 0);
  assert.equal(recoveryRuns, 1);
});





