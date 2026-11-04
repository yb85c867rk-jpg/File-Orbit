import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteConfirmation } from '../../harness/m5-exploration/delete-confirm.js';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; this._text = ''; this.parentNode = null; this.listeners = []; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  addEventListener(type, handler, options = {}) { this.listeners.push({ type, handler, options }); }
  focus() { this.focused = true; }
  contains(target) { return target === this || this.children.includes(target); }
}
function doc() {
  const document = {
    body: new El('body'),
    activeElement: null,
    createElement(tag) { return new El(tag); },
    addEventListener(type, handler, options = {}) { document.listeners.push({ type, handler, options }); },
    listeners: []
  };
  return document;
}
test('confirmation shows counts/name and cancel does not confirm', () => {
  const d = doc(); let confirmed = 0; let cancelled = 0;
  const c = createDeleteConfirmation({ document: d, host: d.body, onConfirm: () => { confirmed += 1; }, onCancel: () => { cancelled += 1; } });
  c.open({ target: { id: 'a', name: 'Alpha', kind: 'folder' }, folders: 2, files: 3, datasetToken: 1, baseRevision: 0, parentId: 'r' });
  assert.match(c.element.textContent, /Alpha/);
  assert.match(c.element.textContent, /2 folders and 3 data items/);
  const cancel = c.element.children[0].children[4].children[0];
  assert.equal(cancel.textContent, 'Cancel');
  assert.equal(cancel.focused, true);
  cancel.listeners[0].handler();
  assert.equal(cancelled, 1);
  assert.equal(confirmed, 0);
  assert.equal(c.isOpen, false);
});
test('confirmation passes captured identity to onConfirm', () => {
  const d = doc(); let payload = null;
  const c = createDeleteConfirmation({ document: d, host: d.body, onConfirm: (value) => { payload = value; } });
  c.open({ target: { id: 'x', name: 'Data', kind: 'file' }, folders: 0, files: 1, datasetToken: 3, baseRevision: 7, parentId: 'a' });
  const confirm = c.element.children[0].children[4].children[1];
  confirm.listeners[0].handler();
  assert.equal(payload.target.id, 'x');
  assert.equal(payload.datasetToken, 3);
  assert.equal(payload.baseRevision, 7);
  assert.equal(payload.parentId, 'a');
});

