import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';

class FakeElement extends EventTarget {
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; this.children = []; this.parentNode = null; this.hidden = false; this.disabled = false; this.textContent = ''; this.className = ''; this.style = {}; this.attributes = new Map(); }
  append(...values) { for (const value of values) { this.children.push(value); value.parentNode = this; } }
  appendChild(value) { this.append(value); return value; }
  removeChild(value) { this.children = this.children.filter((item) => item !== value); value.parentNode = null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { if (node === this) return true; return this.children.some((child) => child.contains?.(node)); }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => { for (const child of node.children) { if (selector === 'button[role="menuitem"]' && child.tagName === 'button' && child.getAttribute('role') === 'menuitem') out.push(child); walk(child); } };
    walk(this); return out;
  }
  getBoundingClientRect() { return { width: 120, height: 40, left: 0, top: 0, right: 120, bottom: 40 }; }
}
class FakeDocument extends EventTarget {
  constructor() { super(); this.activeElement = null; this.body = new FakeElement('body', this); }
  createElement(tag) { return new FakeElement(tag, this); }
}
function setup(extra = {}) {
  const document = new FakeDocument();
  const actions = [];
  const menu = createEditorContextMenu({ document, host: document.body, viewport: () => ({ width: 300, height: 200 }), onAction: (target, action) => actions.push([target, action]), ...extra });
  return { document, menu, actions };
}
test('menu opens only and clamps near viewport', () => {
  const s = setup();
  assert.equal(s.menu.open({ target: { id: 'a', name: 'Alpha', hitKind: 'folder' }, x: 290, y: 190 }), true);
  assert.equal(s.menu.element.hidden, false);
  assert.equal(s.menu.element.style.left, '172px');
  assert.equal(s.menu.element.style.top, '152px');
  assert.equal(s.menu.item.textContent, 'Open Folder');
});
test('root menu is Open, Rename Map, Edit Description, Add, separated Delete; Add owns submenu actions', () => {
  const s = setup();
  const root = { id: 'r', name: 'Root', hitKind: 'folder', isRoot: true };
  s.menu.open({ target: root, x: 10, y: 10 });
  assert.deepEqual([...s.menu.actions.keys()].filter((key) => !s.menu.actions.get(key).hidden && !s.menu.submenu.contains(s.menu.actions.get(key))), ['open-folder', 'rename-map', 'edit-description', 'export-folder', 'delete-folder']);
  assert.equal(s.menu.addButton.hidden, false);
  assert.equal(s.menu.actions.get('delete-folder').disabled, true);
  assert.match(s.menu.actions.get('delete-folder').getAttribute('title'), /structural root/);
  s.menu.addButton.dispatchEvent(new Event('click'));
  assert.equal(s.menu.submenuOpen, true);
  assert.equal(s.menu.addButton.getAttribute('aria-expanded'), 'true');
  s.menu.actions.get('add-folder').dispatchEvent(new Event('click'));
  assert.deepEqual(s.actions, [[root, 'add-folder']]);
  assert.equal(s.menu.isOpen, false);
});
test('descendant folder keeps Open, Edit Folder, Add, separated Delete', () => {
  const s = setup();
  const folder = { id: 'f', name: 'Folder', hitKind: 'folder', isRoot: false };
  s.menu.open({ target: folder, x: 10, y: 10 });
  assert.deepEqual([...s.menu.actions.keys()].filter((key) => !s.menu.actions.get(key).hidden && !s.menu.submenu.contains(s.menu.actions.get(key))), ['open-folder', 'edit-folder', 'export-folder', 'delete-folder']);
  assert.equal(s.menu.actions.get('rename-map').hidden, true);
  assert.equal(s.menu.actions.get('edit-description').hidden, true);
});
test('data menu is Open, Edit Data, separated Delete Data only', () => {
  const s = setup();
  const data = { id: 'x', name: 'Data', hitKind: 'file' };
  s.menu.open({ target: data, x: 10, y: 10 });
  assert.deepEqual([...s.menu.actions.keys()].filter((key) => !s.menu.actions.get(key).hidden), ['open-data', 'edit-data', 'save-data-as', 'delete-data']);
  assert.equal(s.menu.actions.get('save-data-as').disabled, true);
  assert.match(s.menu.actions.get('save-data-as').getAttribute('title'), /no attached file content/i);
  assert.equal(s.menu.addButton.hidden, true);
  assert.equal(s.menu.actions.get('upload-files').hidden, true);
  s.menu.actions.get('open-data').dispatchEvent(new Event('click'));
  assert.deepEqual(s.actions.at(-1), [data, 'open-data']);
});
test('outside pointer and Escape dismiss; destroy removes DOM', () => {
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

test('Save Data As dispatches only when live content is exportable', () => {
  const s = setup({ getDataExportState: () => ({ enabled: true, title: 'Save Data As…' }) });
  const data = { id: 'x', name: 'Data', hitKind: 'file' };
  s.menu.open({ target: data, x: 10, y: 10 });
  assert.equal(s.menu.actions.get('save-data-as').disabled, false);
  s.menu.actions.get('save-data-as').dispatchEvent(new Event('click'));
  assert.deepEqual(s.actions.at(-1), [data, 'save-data-as']);
});
