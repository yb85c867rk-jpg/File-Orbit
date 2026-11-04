import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDragGesture } from '../../../src/engine/hypertree/exploration/index.js';
import { attachLabelSelection } from '../../../src/engine/hypertree/editor/label-selection.js';

class FakeHost {
  constructor() { this.listeners = []; }
  addEventListener(type, handler, capture = false) { this.listeners.push({ type, handler, capture: Boolean(capture) }); }
  removeEventListener(type, handler, capture = false) {
    this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.handler === handler && entry.capture === Boolean(capture)));
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  fire(type, event) {
    const immediate = { stopped: false };
    event.stopImmediatePropagation = () => { immediate.stopped = true; };
    for (const entry of [...this.listeners]) {
      if (entry.type !== type) continue;
      entry.handler(event);
      if (immediate.stopped) break;
    }
  }
}

function setup(order = 'drag-first') {
  const host = new FakeHost();
  let selected = 0;
  const dragEvents = [];
  const dragOptions = {
    canvas: host,
    threshold: 4,
    hitAt: () => ({ id: 'x' }),
    onStart: () => dragEvents.push('start'),
    onMove: () => dragEvents.push('move'),
    onDrop: () => dragEvents.push('drop'),
    onCancel: () => dragEvents.push('cancel')
  };
  let drag;
  let detach;
  const attachSelection = () => {
    detach = attachLabelSelection({
      host,
      overlay: { labelAtPoint: () => ({ id: 'x' }) },
      getFrameState: () => ({ hit: {} }),
      getDetails: () => ({ kind: 'file' }),
      isClickSuppressed: () => Boolean(drag?.clickSuppressed),
      select: () => { selected += 1; }
    });
  };
  if (order === 'drag-first') { drag = createNodeDragGesture(dragOptions); attachSelection(); }
  else { attachSelection(); drag = createNodeDragGesture(dragOptions); }
  return { host, drag, detach, get selected() { return selected; }, dragEvents };
}
function pointer(type, x, y) {
  return { type, button: 0, pointerType: 'mouse', isPrimary: true, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} };
}
function click(target = null) {
  return { type: 'click', button: 0, clientX: 10, clientY: 10, target, preventDefault() {}, stopPropagation() {} };
}

for (const order of ['drag-first', 'selection-first']) {
  test(`generated drag click is rejected before label selection (${order})`, () => {
    const s = setup(order);
    s.host.fire('pointerdown', pointer('pointerdown', 10, 10));
    s.host.fire('pointermove', pointer('pointermove', 20, 20));
    s.host.fire('pointerup', pointer('pointerup', 20, 20));
    assert.equal(s.drag.clickSuppressed, true);
    assert.equal(s.selected, 0);
    s.host.fire('click', click());
    assert.equal(s.selected, 0);
    assert.equal(s.drag.clickSuppressed, false);
    s.host.fire('click', click());
    assert.equal(s.selected, 1);
    s.drag.destroy();
    s.detach();
  });
}
test('below-threshold gesture remains an ordinary label click', () => {
  const s = setup();
  s.host.fire('pointerdown', pointer('pointerdown', 10, 10));
  s.host.fire('pointerup', pointer('pointerup', 11, 10));
  assert.equal(s.drag.clickSuppressed, false);
  s.host.fire('click', click());
  assert.equal(s.selected, 1);
  s.drag.destroy();
  s.detach();
});
test('web-link native click bypasses label selection', () => {
  const s = setup();
  const target = { closest: (selector) => selector.includes('[data-vd-link]') ? {} : null };
  s.host.fire('click', click(target));
  assert.equal(s.selected, 0);
  s.drag.destroy();
  s.detach();
});test('destroy releases active label drag and stale pointer/click events are inert', () => {
  const s = setup();
  s.host.fire('pointerdown', pointer('pointerdown', 10, 10));
  s.host.fire('pointermove', pointer('pointermove', 20, 20));
  assert.deepEqual(s.dragEvents, ['start', 'move']);
  s.drag.destroy();
  s.drag.destroy();
  s.detach();
  const count = s.dragEvents.length;
  s.host.fire('pointermove', pointer('pointermove', 40, 40));
  s.host.fire('pointerup', pointer('pointerup', 40, 40));
  s.host.fire('click', click());
  assert.equal(s.dragEvents.length, count);
  assert.equal(s.selected, 0);
  assert.equal(s.drag.clickSuppressed, false);
  s.detach();
});test('file name click reports file-name activation, icon click reports icon activation', () => {
  const host = new FakeHost();
  const activations = [];
  const detach = attachLabelSelection({
    host,
    overlay: { labelAtPoint: () => ({ id: 'x' }) },
    getFrameState: () => ({ hit: {} }),
    getDetails: () => ({ kind: 'file' }),
    select: (_id, meta) => activations.push(meta.activation)
  });
  host.fire('click', click({ closest: (selector) => selector === '[data-vd-name]' ? {} : null }));
  host.fire('click', { type: 'click', button: 0, clientX: 10, clientY: 10, target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(activations, ['file-name', 'icon']);
  detach();
});test('host-targeted click uses overlay geometry for file-name activation', () => {
  const host = new FakeHost();
  const activations = [];
  const detach = attachLabelSelection({
    host,
    overlay: { labelAtPoint: () => ({ id: 'x' }), labelActivationAtPoint: () => ({ id: 'x', activation: 'file-name' }) },
    getFrameState: () => ({ hit: {} }),
    getDetails: () => ({ kind: 'file' }),
    select: (_id, meta) => activations.push(meta.activation)
  });
  host.fire('click', { type: 'click', button: 0, clientX: 10, clientY: 10, target: { closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(activations, ['file-name']);
  detach();
});


