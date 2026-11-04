import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLabelContextMenu } from '../../../src/engine/hypertree/editor/label-context-menu.js';

class FakeDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler, capture) { this.listeners.set(type, { handler, capture }); }
  removeEventListener(type, handler) { if (this.listeners.get(type)?.handler === handler) this.listeners.delete(type); }
  fire(type, event) { this.listeners.get(type)?.handler(event); }
}
function setup(overrides = {}) {
  const document = new FakeDocument();
  const diagnostics = [];
  const activated = [];
  const overlay = {
    labelAtPoint: () => ({ id: 'x', link: false }),
    ...(overrides.overlay || {})
  };
  const detach = attachLabelContextMenu({
    document, overlay,
    getFrameState: () => ({ hit: {} }),
    getGraph: () => ({ nodes: new Map([['x', { id: 'x', kind: 'file' }]]) }),
    getVisibleSet: () => new Set(['x']),
    getDetails: () => ({ kind: 'file', name: 'Data' }),
    activate: (target, event) => { activated.push([target, event]); return true; },
    isTransitioning: () => false,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    ...overrides
  });
  return { document, detach, activated, diagnostics };
}
function contextEvent() {
  return {
    button: 2, clientX: 10, clientY: 20, defaultPrevented: false, target: null,
    preventDefault() { this.defaultPrevented = true; }
  };
}
test('label context menu activates the exact stable label owner through the shared path', () => {
  const s = setup();
  const event = contextEvent();
  s.document.fire('contextmenu', event);
  assert.equal(s.activated.length, 1);
  assert.deepEqual(s.activated[0][0], { id: 'x', kind: 'file' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.__vdEditorHandled, true);
  s.detach();
  s.document.fire('contextmenu', contextEvent());
  assert.equal(s.activated.length, 1);
});
test('background and hidden labels retain the native menu', () => {
  const background = setup({ overlay: { labelAtPoint: () => null } });
  const event = contextEvent();
  background.document.fire('contextmenu', event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(background.activated.length, 0);
  background.detach();
});
test('missing frame and stale labels are diagnosed and not handled', () => {
  const noFrame = setup({ getFrameState: () => null });
  const e1 = contextEvent();
  noFrame.document.fire('contextmenu', e1);
  assert.equal(e1.defaultPrevented, false);
  assert.equal(noFrame.diagnostics[0].reason, 'context-menu-no-coherent-frame');
  noFrame.detach();
  const stale = setup({ getVisibleSet: () => new Set() });
  const e2 = contextEvent();
  stale.document.fire('contextmenu', e2);
  assert.equal(e2.defaultPrevented, false);
  assert.equal(stale.diagnostics[0].reason, 'context-menu-stale-or-invisible-label');
  stale.detach();
});
test('transition state rejects label activation without touching the native menu', () => {
  const s = setup({ isTransitioning: () => true });
  const event = contextEvent();
  s.document.fire('contextmenu', event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(s.activated.length, 0);
  assert.equal(s.diagnostics[0].reason, 'context-menu-transition-busy');
  s.detach();
});
