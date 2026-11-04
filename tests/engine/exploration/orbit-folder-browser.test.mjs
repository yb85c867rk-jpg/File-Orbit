import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbitFolderBrowserDialog } from '../../harness/m5-exploration/orbit-folder-browser.js';

class E {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this._text = ''; this.className = ''; this.listeners = new Map(); this.isConnected = true; this.attributes = new Map(); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  matches(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === '[data-entry-key]') return this.dataset.entryKey !== undefined;
    const attr = selector.match(/^\[([^=]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const [name, value] = [attr[1], attr[2]];
      if (name === 'data-entry-kind') return value === undefined ? this.dataset.entryKind !== undefined : this.dataset.entryKind === value;
    }
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    return false;
  }
  querySelectorAll(selector) { const out = []; const walk = (node) => { for (const child of node.children) { if (child.matches?.(selector)) out.push(child); walk(child); } }; walk(this); return out; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  click() { if (this.disabled) return; for (const fn of this.listeners.get('click') || []) fn({ type: 'click', preventDefault() {} }); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.isConnected = false; }
  keydown(event) { for (const fn of this.listeners.get('keydown') || []) fn({ ...event, preventDefault() {} }); }
}
class D { constructor() { this.body = new E('body'); this.body.ownerDocument = this; this.host = new E('div'); this.body.append(this.host); this.activeElement = this.body; } createElement(tag) { const el = new E(tag); el.ownerDocument = this; return el; } }

const folder = (name) => ({ key: `folder:${name}`, name, kind: 'folder', handle: { name, kind: 'directory' } });
const file = (name) => ({ key: `file:${name}`, name, kind: 'file', size: 10, handle: { name, kind: 'file' } });
const snapshot = (over = {}) => ({
  phase: 'ready', handle: { name: 'Root' }, name: 'Root',
  path: [{ index: 0, key: 'path:0', name: 'Root' }],
  folders: [folder('가-폴더')], files: [file('alpha.orbit'), file('한국어.orbit')],
  selected: null, error: null, truncated: false, canConnect: true, ...over
});
const buttons = (dialog) => dialog.element.querySelectorAll('button');

test('folder browser distinguishes folders and .orbit files without opening or connecting on browse', () => {
  const document = new D(); const calls = [];
  const dialog = createOrbitFolderBrowserDialog({ document, host: document.host, supported: true, onNavigate: (entry) => calls.push('nav:' + entry.name), onConnect: () => calls.push('connect'), onOpenEntry: (entry) => calls.push('open:' + entry.name), onChooseFolder: () => calls.push('choose') });
  dialog.show({ session: 1, dataset: 1 }); dialog.update(snapshot());
  assert.equal(dialog.element.hidden, false);
  assert.match(dialog.element.textContent, /Current folder: Root/);
  assert.match(dialog.element.textContent, /가-폴더/); assert.match(dialog.element.textContent, /Folder/);
  assert.match(dialog.element.textContent, /alpha\.orbit/); assert.match(dialog.element.textContent, /Orbit file/);
  buttons(dialog).find((button) => button.textContent.includes('가-폴더')).click();
  assert.deepEqual(calls, ['nav:가-폴더']);
  assert.equal(dialog.isOpen, true);
  buttons(dialog).find((button) => button.textContent.includes('alpha.orbit')).click();
  assert.deepEqual(calls, ['nav:가-폴더'], 'selecting a file does not open it');
  const open = buttons(dialog).find((button) => button.dataset.openBrowser === 'open');
  assert.equal(open.disabled, false);
  open.click();
  assert.deepEqual(calls, ['nav:가-폴더', 'open:alpha.orbit']);
  assert.equal(dialog.isOpen, false);
});

test('explicit Connect and Cancel remain separate actions', () => {
  const document = new D(); const calls = [];
  const dialog = createOrbitFolderBrowserDialog({ document, host: document.host, supported: true, onConnect: () => calls.push('connect'), onClose: () => calls.push('close') });
  dialog.show({ session: 1, dataset: 1 }); dialog.update(snapshot());
  buttons(dialog).find((button) => button.textContent === 'Connect This Folder').click();
  assert.deepEqual(calls, ['connect']);
  buttons(dialog).find((button) => button.textContent === 'Cancel').click();
  assert.deepEqual(calls, ['connect', 'close']);
  assert.equal(dialog.isOpen, false);
});

test('breadcrumb, parent, loading, empty, blocked, unsupported, and focus behavior', () => {
  const document = new D(); const calls = [];
  const trigger = document.createElement('button'); document.host.append(trigger); trigger.focus();
  const dialog = createOrbitFolderBrowserDialog({ document, host: document.host, supported: true, onBreadcrumb: (index) => calls.push('crumb:' + index), onUp: () => calls.push('up'), onRefresh: () => calls.push('refresh'), onClose: () => calls.push('close') });
  dialog.show({ session: 1, dataset: 1 });
  dialog.update(snapshot({ name: 'Child', path: [{ index: 0, key: 'p0', name: 'Root' }, { index: 1, key: 'p1', name: 'Child' }], folders: [], files: [] }));
  const crumbButtons = buttons(dialog).filter((button) => button.dataset.breadcrumbIndex !== undefined);
  assert.equal(crumbButtons.length, 2);
  crumbButtons[0].click(); assert.deepEqual(calls, ['crumb:0']);
  buttons(dialog).find((button) => button.textContent === 'Parent').click(); assert.deepEqual(calls, ['crumb:0', 'up']);
  assert.match(dialog.element.textContent, /no subfolders or \.orbit files/i);
  dialog.update(snapshot({ phase: 'listing', folders: [], files: [] })); assert.match(dialog.element.textContent, /Loading folder contents/i);
  dialog.update(snapshot({ phase: 'blocked', error: { message: 'Permission was denied.' }, folders: [], files: [] })); assert.match(dialog.element.textContent, /Permission was denied/i);
  dialog.element.keydown({ key: 'Escape' }); assert.equal(dialog.isOpen, false); assert.equal(document.activeElement, trigger);
  const unsupported = createOrbitFolderBrowserDialog({ document, host: document.host, supported: false });
  unsupported.show({ session: 2, dataset: 1 });
  assert.match(unsupported.element.textContent, /folder access is not available/i);
  assert.equal(buttons(unsupported).find((button) => button.dataset.openBrowser === 'choose-folder').disabled, true);
});

test('focus trap follows enabled controls and Escape restores the trigger', () => {
  const document = new D(); const trigger = document.createElement('button'); document.host.append(trigger); trigger.focus();
  const dialog = createOrbitFolderBrowserDialog({ document, host: document.host, supported: true });
  dialog.show({ session: 1, dataset: 1 }); dialog.update(snapshot());
  const choose = buttons(dialog).find((button) => button.dataset.openBrowser === 'choose-folder');
  const refresh = buttons(dialog).find((button) => button.dataset.openBrowser === 'refresh');
  const cancel = buttons(dialog).find((button) => button.dataset.openBrowser === 'cancel');
  choose.focus();
  dialog.element.keydown({ key: 'Tab', shiftKey: false }); assert.equal(document.activeElement, refresh);
  cancel.focus(); dialog.element.keydown({ key: 'Tab', shiftKey: false }); assert.equal(document.activeElement, buttons(dialog).find((button) => button.dataset.breadcrumbIndex === '0'));
  dialog.element.keydown({ key: 'Escape' }); assert.equal(dialog.isOpen, false); assert.equal(document.activeElement, trigger);
});

