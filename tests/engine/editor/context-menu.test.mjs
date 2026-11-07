import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';

class FakeElement extends EventTarget {
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; this.children = []; this.parentNode = null; this.hidden = false; this.disabled = false; this.textContent = ''; this.style = {}; this.attributes = new Map(); }
  append(...values) { for (const value of values) { this.children.push(value); value.parentNode = this; } }
  appendChild(value) { this.append(value); return value; }
  removeChild(value) { this.children = this.children.filter((item) => item !== value); value.parentNode = null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { if (node === this) return true; return this.children.some((child) => child.contains?.(node)); }
  getBoundingClientRect() { return { width: 120, height: 40 }; }
}
class FakeDocument extends EventTarget {
  constructor() { super(); this.activeElement = null; this.body = new FakeElement('body', this); }
  createElement(tag) { return new FakeElement(tag, this); }
}
function setup() {
  const document = new FakeDocument();
  const actions = [];
  const menu = createEditorContextMenu({ document, host: document.body, viewport: () => ({ width: 300, height: 200 }), onAction: (target, action) => actions.push([target, action]) });
  return { document, menu, actions };
}
test('menu opens only and clamps near viewport', () => {
  const s = setup();
  const target = { id: 'a', name: 'Alpha', hitKind: 'folder' };
  assert.equal(s.menu.open({ target, x: 290, y: 190 }), true);
  assert.equal(s.menu.element.hidden, false);
  assert.equal(s.menu.element.style.left, '172px');
  assert.equal(s.menu.element.style.top, '152px');
  assert.equal(s.menu.item.textContent, 'Edit Folder');
});
test('folder menu is Edit Folder, Add Folder, Add Data, Upload, disabled Delete Folder', () => {
  const s = setup();
  const root = { id: 'r', name: 'Root', hitKind: 'folder', isRoot: true };
  s.menu.open({ target: root, x: 10, y: 10 });
  assert.deepEqual([...s.menu.actions.keys()].filter((key) => !s.menu.actions.get(key).hidden), ['edit-folder', 'add-folder', 'add-data', 'upload-files', 'upload-folder', 'delete-folder']);
  s.menu.actions.get('add-data').dispatchEvent(new Event('click'));
  assert.deepEqual(s.actions, [[root, 'add-data']]);
  assert.equal(s.menu.element.hidden, true);
});
test('data menu is Edit Data and disabled Delete Data only', () => {
  const s = setup();
  const data = { id: 'x', name: 'Data', hitKind: 'file' };
  s.menu.open({ target: data, x: 10, y: 10 });
  assert.deepEqual([...s.menu.actions.keys()].filter((key) => !s.menu.actions.get(key).hidden), ['edit-data', 'delete-data']);
  assert.equal(s.menu.actions.get('upload-files').hidden, true);
  assert.equal(s.menu.actions.get('upload-folder').hidden, true);
  s.menu.actions.get('edit-data').dispatchEvent(new Event('click'));
  assert.deepEqual(s.actions.at(-1), [data, 'edit-data']);
});
test('outside click and Escape dismiss; destroy removes DOM', () => {
  const s = setup();
  s.menu.open({ target: { id: 'a', name: 'Alpha', hitKind: 'folder' }, x: 20, y: 20 });
  const down = new Event('pointerdown', { cancelable: true });
  s.document.dispatchEvent(down);
  assert.equal(s.menu.isOpen, false);
  assert.equal(down.defaultPrevented, true);
  s.menu.open({ target: { id: 'a', name: 'Alpha', hitKind: 'folder' }, x: 20, y: 20 });
  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  s.document.dispatchEvent(escape);
  assert.equal(s.menu.isOpen, false);
  s.menu.destroy();
  assert.equal(s.document.body.children.includes(s.menu.element), false);
});


