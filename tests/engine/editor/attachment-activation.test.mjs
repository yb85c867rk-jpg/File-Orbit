import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLabelSelection } from '../../../src/engine/hypertree/editor/label-selection.js';
import { createAttachmentViewer } from '../../../src/engine/hypertree/editor/attachment-viewer.js';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; this._text = ''; this.listeners = new Map(); this.parentNode = null; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  focus() {}
}
function doc() { const d = { activeElement: null, body: new El('body'), listeners: [], createElement(tag) { return new El(tag); }, addEventListener(type, handler) { d.listeners.push({ type, handler }); } }; return d; }
class Host { constructor() { this.listeners = new Map(); } addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); } removeEventListener(type, handler) { this.listeners.set(type, (this.listeners.get(type) || []).filter((h) => h !== handler)); } fire(type, event) { for (const handler of this.listeners.get(type) || []) handler(event); } }
function click(nameTarget) { return { type: 'click', button: 0, clientX: 5, clientY: 5, target: { closest: (selector) => nameTarget && selector === '[data-vd-name]' ? {} : null }, preventDefault() {}, stopPropagation() {} }; }
test('file-name activation opens viewer; icon activation selects only', async () => {
  const host = new Host(); const document = doc();
  const text = new Blob(['hello'], { type: 'text/plain' });
  const id = 'att-1';
  const registry = { get: (key) => key === id ? { id, file: text, name: 'a.txt', metadata: { attachmentId: id, classification: { format: 'text' }, mime: 'text/plain' } } : null };
  const details = { kind: 'file', name: 'A', attachment: { attachmentId: id, originalName: 'a.txt', classification: { format: 'text' } } };
  const viewer = createAttachmentViewer({ document, host: document.body });
  let opened = 0;
  const detach = attachLabelSelection({
    host,
    overlay: { labelAtPoint: () => ({ id: 'n' }) },
    getFrameState: () => ({ hit: {} }),
    getDetails: () => details,
    select: (_id, meta) => { opened += 1; if (meta.activation === 'file-name') viewer.open({ details, registry }); }
  });
  host.fire('click', click(true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(opened, 1);
  assert.equal(viewer.isOpen, true);
  viewer.close();
  host.fire('click', click(false));
  assert.equal(opened, 2);
  assert.equal(viewer.isOpen, false);
  viewer.destroy(); detach();
});

test('actual filename click opens a YAML attachment through the plain-text viewer despite generic MIME', async () => {
  const host = new Host(); const document = doc();
  const text = new Blob(['\uFEFF한글:\n  - value\n<script>literal</script>'], { type: '' });
  Object.defineProperty(text, 'name', { value: 'name.yaml' });
  const id = 'att-yaml';
  const classification = { format: 'generic', badge: 'YAML', reason: 'unknown-extension-inconclusive-mime' };
  const registry = { get: (key) => key === id ? { id, file: text, name: 'name.yaml', metadata: { attachmentId: id, classification, mime: '' } } : null };
  const details = { kind: 'file', name: 'name.yaml', attachment: { attachmentId: id, originalName: 'name.yaml', classification, mime: '' } };
  const viewer = createAttachmentViewer({ document, host: document.body });
  const detach = attachLabelSelection({ host, overlay: { labelAtPoint: () => ({ id: 'n' }) }, getFrameState: () => ({ hit: {} }), getDetails: () => details, select: (_id, meta) => { if (meta.activation === 'file-name') viewer.open({ details, registry }); } });
  host.fire('click', click(true));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(viewer.isOpen, true);
  assert.equal(viewer.state, 'ready');
  assert.match(viewer.element.textContent, /한글:/);
  assert.match(viewer.element.textContent, /<script>literal<\/script>/);
  viewer.close(); viewer.destroy(); detach();
});
