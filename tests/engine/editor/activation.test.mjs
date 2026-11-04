import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnoseEditorTarget, editorActivationBlockReason, resolveEditorTarget, validateEditorMenuTarget } from '../../../src/engine/hypertree/editor/activation.js';
import { attachEditorContextMenu } from '../../../src/engine/hypertree/editor/context-menu.js';
import { openEditorMenu } from '../../../src/engine/hypertree/editor/activation-flow.js';
import { createEditorTarget } from '../../../src/engine/hypertree/editor/target.js';
import { createHitSnapshot } from '../../../src/engine/hypertree/interaction/index.js';

class Canvas extends EventTarget {
  constructor(width = 1100, height = 473) { super(); this.width = width; this.height = height; this.clientLeft = 0; this.clientTop = 0; this.clientWidth = width; this.clientHeight = height; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
}
const scene = { nodes: new Map([
  ['r', { id: 'r', kind: 'folder', visible: true, center: { x: 500, y: 220 }, radius: 10, shape: 'circle' }],
  ['a', { id: 'a', kind: 'folder', visible: true, center: { x: 100, y: 100 }, radius: 10, shape: 'circle' }],
  ['b', { id: 'b', kind: 'folder', visible: true, center: { x: 300, y: 100 }, radius: 10, shape: 'circle' }]
]) };
const graph = { nodes: new Map([['r', { id: 'r', kind: 'folder' }], ['a', { id: 'a', kind: 'folder' }], ['b', { id: 'b', kind: 'folder' }]]) };
const visibleSet = new Set(['r', 'a', 'b']);
const hit = createHitSnapshot(scene);
test('right-click editor target uses final hit geometry in CSS coordinates', () => {
  const canvas = new Canvas();
  const target = resolveEditorTarget({ event: { button: 2, clientX: 100, clientY: 100 }, canvas, frameState: { hit }, graph });
  assert.equal(target.id, 'a');
  assert.equal(target.kind, 'folder');
  const data = resolveEditorTarget({ event: { button: 2, clientX: 300, clientY: 100 }, canvas, frameState: { hit }, graph });
  assert.equal(data.id, 'b');
  assert.equal(data.kind, 'folder');
  const root = resolveEditorTarget({ event: { button: 2, clientX: 500, clientY: 220 }, canvas, frameState: { hit }, graph });
  assert.equal(root.id, 'r');
});
test('right-click background and left-click do not resolve an editor target', () => {
  const canvas = new Canvas();
  assert.equal(resolveEditorTarget({ event: { button: 2, clientX: 500, clientY: 300 }, canvas, frameState: { hit }, graph }), null);
  assert.equal(resolveEditorTarget({ event: { button: 0, clientX: 100, clientY: 100 }, canvas, frameState: { hit }, graph }), null);
});
test('context menu protects only handled targets and removes the exact listener', () => {
  const canvas = new Canvas();
  let activations = 0;
  const detach = attachEditorContextMenu({
    canvas,
    resolve: (event) => (event.clientX === 100 ? { id: 'a' } : null),
    activate: () => { activations += 1; return true; }
  });
  const handled = new Event('contextmenu', { cancelable: true });
  Object.defineProperty(handled, 'button', { value: 2 });
  Object.defineProperty(handled, 'clientX', { value: 100 });
  canvas.dispatchEvent(handled);
  assert.equal(activations, 1);
  assert.equal(handled.defaultPrevented, true);
  const background = new Event('contextmenu', { cancelable: true });
  Object.defineProperty(background, 'button', { value: 2 });
  Object.defineProperty(background, 'clientX', { value: 0 });
  canvas.dispatchEvent(background);
  assert.equal(activations, 1);
  assert.equal(background.defaultPrevented, false);
  detach();
  canvas.dispatchEvent(handled);
  assert.equal(activations, 1);
});
test('activation ownership rejects inert, transitive, drag, saving, and incoherent frames', () => {
  assert.equal(editorActivationBlockReason({ frameReady: true }), null);
  assert.equal(editorActivationBlockReason({ editorInert: true }), 'editor-inert');
  assert.equal(editorActivationBlockReason({ navigatorBusy: true }), 'transition-busy');
  assert.equal(editorActivationBlockReason({ dragOwned: true }), 'drag-busy');
  assert.equal(editorActivationBlockReason({ editorSaving: true }), 'editor-saving');
  assert.equal(editorActivationBlockReason({ frameReady: false }), 'frame-not-ready');
});
test('menu target revalidates identity, kind, and current visibility before form open', () => {
  const target = { id: 'a', hitKind: 'folder', datasetToken: 2, baseRevision: 5 };
  assert.equal(validateEditorMenuTarget({ target, datasetToken: 2, baseRevision: 5, graph, visibleSet }).ok, true);
  assert.equal(validateEditorMenuTarget({ target, datasetToken: 3, baseRevision: 5, graph, visibleSet }).reason, 'stale-identity');
  assert.equal(validateEditorMenuTarget({ target, datasetToken: 2, baseRevision: 6, graph, visibleSet }).reason, 'stale-identity');
  assert.equal(validateEditorMenuTarget({ target: { ...target, hitKind: 'file' }, datasetToken: 2, baseRevision: 5, graph, visibleSet }).reason, 'stale-target');
  assert.equal(validateEditorMenuTarget({ target, datasetToken: 2, baseRevision: 5, graph, visibleSet: new Set() }).reason, 'stale-target');
});
test('menu open uses the explicitly supplied contextmenu event, never a global', () => {
  const target = createEditorTarget({ id: 'a', hitKind: 'folder', datasetToken: 2, baseRevision: 5 });
  let received = null;
  assert.equal(openEditorMenu({
    target,
    event: { type: 'contextmenu', clientX: 33, clientY: 44 },
    openMenu: (value) => { received = value; return true; }
  }), true);
  assert.equal(received.x, 33);
  assert.equal(received.y, 44);
  assert.equal(received.target.id, 'a');
  assert.equal(openEditorMenu({ target, event: { type: 'pointerdown', clientX: 1, clientY: 2 }, openMenu: () => true }), false);
  assert.equal(openEditorMenu({ target, event: { type: 'contextmenu', clientX: NaN, clientY: 2 }, openMenu: () => true }), false);
});
test('glyph context-menu diagnosis distinguishes frame, coordinate, hit, and stale failures', () => {
  const canvas = new Canvas();
  const event = { button: 2, clientX: 100, clientY: 100 };
  assert.equal(diagnoseEditorTarget({ event, canvas, frameState: null, graph }).reason, 'no-coherent-frame');
  assert.equal(diagnoseEditorTarget({ event: { button: 1, clientX: 1, clientY: 1 }, canvas, frameState: { hit }, graph }).reason, 'invalid-button');
  const badCanvas = { getBoundingClientRect() { throw new Error('bad'); } };
  assert.equal(diagnoseEditorTarget({ event, canvas: badCanvas, frameState: { hit }, graph }).reason, 'coordinate-conversion-failed');
  assert.equal(diagnoseEditorTarget({ event: { button: 2, clientX: 1000, clientY: 450 }, canvas, frameState: { hit }, graph }).reason, 'hit-miss');
  const incomplete = { nodes: new Map([['a', { id: 'a', kind: 'folder' }]]) };
  assert.equal(diagnoseEditorTarget({ event: { button: 2, clientX: 300, clientY: 100 }, canvas, frameState: { hit }, graph: incomplete }).reason, 'stale-target');
  assert.equal(diagnoseEditorTarget({ event, canvas, frameState: { hit }, graph }).target.id, 'a');
});
test('replacement guard blocks editor activation', () => {
  assert.equal(editorActivationBlockReason({ replacementPending: true, frameReady: true }), 'replacement-pending');
  assert.equal(editorActivationBlockReason({ replacementPending: false, frameReady: true }), null);
});
