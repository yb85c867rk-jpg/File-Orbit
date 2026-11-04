import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileOpenBrowserDialog } from '../../harness/m5-exploration/file-open-browser.js';

class E {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this._text = ''; this.className = ''; this.listeners = new Map(); this.isConnected = true; this.attributes = new Map(); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  querySelectorAll(selector) { const out = []; const walk = (node) => { for (const child of node.children) { if (selector === 'button' && child.tagName === 'BUTTON') out.push(child); walk(child); } }; walk(this); return out; }
  setAttribute(name, v) { this.attributes.set(name, String(v)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  click() { if (this.disabled) return; for (const fn of this.listeners.get('click') || []) fn({ type: 'click', preventDefault() {} }); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.isConnected = false; }
  keydown(event) { for (const fn of this.listeners.get('keydown') || []) fn({ ...event, preventDefault() {} }); }
}
class D {
  constructor() { this.body = new E('body'); this.body.ownerDocument = this; this.host = new E('div'); this.body.append(this.host); this.activeElement = this.body; }
  createElement(tag) { const el = new E(tag); el.ownerDocument = this; return el; }
}

const entry = (key, name) => ({ key, name, size: 10, lastModified: 1, handle: { name } });
const snapshot = (over = {}) => ({ phase: 'ready', handle: { name: 'Orbit A' }, name: 'Orbit A', entries: [entry('a', 'alpha.orbit'), entry('b', 'beta.orbit')], truncated: false, stale: false, error: null, ...over });

test('integrated browser shows the Orbit folder, current map, list, and controls', () => {
  const document = new D(); const calls = [];
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true, onChooseFolder: () => calls.push('folder'), onRefresh: () => calls.push('refresh'), onOpenEntry: (value) => calls.push(value.key), onOpenFileElsewhere: () => calls.push('elsewhere'), onClose: () => calls.push('close') });
  dialog.show({ session: 1, dataset: 1 });
  dialog.update(snapshot(), { currentKey: 'b' });
  const overlay = document.host.children[0];
  const card = overlay.children.find((child) => child.className === 'file-open-browser-card');
  const heading = card.children.find((child) => child.tagName === 'H2');
  assert.equal(heading.textContent, 'Open Orbit Folder');
  assert.equal(heading.id, 'file-open-browser-title');
  assert.equal(overlay.getAttribute('aria-labelledby'), 'file-open-browser-title');
  const buttons = overlay.querySelectorAll('button');
  assert.equal(buttons.some((button) => button.textContent === 'Change folder'), true);
  assert.equal(document.host.children[0].textContent.includes('alpha.orbit'), true);
  const alpha = buttons.find((button) => button.textContent === 'alpha.orbit');
  const beta = buttons.find((button) => button.textContent === 'beta.orbit');
  assert.equal(beta.getAttribute('aria-current'), 'true');
  assert.equal(alpha.getAttribute('aria-current'), null);
  alpha.click();
  assert.deepEqual(calls, ['a']);
  assert.equal(dialog.isOpen, false);
});

test('no Orbit state explains folder selection; elsewhere and close remain available', () => {
  const document = new D(); const calls = [];
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true, onChooseFolder: () => calls.push('folder'), onOpenFileElsewhere: () => calls.push('elsewhere'), onClose: () => calls.push('close') });
  dialog.show({ session: 1, dataset: 1 });
  const buttons = document.host.children[0].querySelectorAll('button');
  assert.equal(buttons.find((button) => button.textContent === 'Choose folder').disabled, false);
  assert.match(document.host.children[0].textContent, /Choose a folder/i);
  buttons.find((button) => button.textContent === 'Open file elsewhere…').click();
  assert.deepEqual(calls, ['elsewhere']);
  assert.equal(dialog.isOpen, false);
  dialog.show({ session: 2, dataset: 2 }); dialog.close(); assert.equal(dialog.isOpen, false);
});

test('unsupported directory access disables folder choice but keeps standalone Open', () => {
  const document = new D(); const calls = [];
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: false, onOpenFileElsewhere: () => calls.push('elsewhere') });
  dialog.show({ session: 1, dataset: 1 });
  const buttons = document.host.children[0].querySelectorAll('button');
  assert.equal(buttons.find((button) => button.textContent === 'Choose folder').disabled, true);
  assert.match(document.host.children[0].textContent, /folder access is not available/i);
  buttons.find((button) => button.textContent === 'Open file elsewhere…').click();
  assert.deepEqual(calls, ['elsewhere']);
});

test('browser has request identity and updates only while the same dialog is open', () => {
  const document = new D();
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true });
  dialog.show({ session: 1, dataset: 1 });
  const first = dialog.requestId;
  assert.equal(dialog.owns(1, 1), true);
  dialog.close();
  assert.equal(dialog.owns(1, 1), false);
  dialog.show({ session: 1, dataset: 1 });
  assert.notEqual(dialog.requestId, first);
  dialog.update(snapshot({ name: 'Later Orbit' }));
  assert.match(document.host.children[0].textContent, /Later Orbit/);
});

test('browser contains focus, closes on Escape, and restores the Open File trigger', () => {
  const document = new D(); const trigger = document.createElement('button'); trigger.ownerDocument = document; document.host.append(trigger); trigger.focus();
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true });
  dialog.show({ session: 1, dataset: 1 });
  const overlay = document.host.children.at(-1);
  const buttons = overlay.querySelectorAll('button');
  const choose = buttons.find((button) => button.textContent === 'Choose folder');
  assert.equal(document.activeElement, choose);
  const close = buttons.find((button) => button.textContent === 'Close'); close.focus();
  overlay.keydown({ key: 'Tab', shiftKey: false });
  assert.equal(document.activeElement, choose);
  overlay.keydown({ key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, close);
  overlay.keydown({ key: 'Escape' });
  assert.equal(dialog.isOpen, false);
  assert.equal(document.activeElement, trigger);
});


test('browser exposes loading, blocked/error, empty, and truncated states', () => {
  const document = new D();
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true });
  dialog.show({ session: 1, dataset: 1 });
  const card = document.host.children.at(-1).children[0];
  dialog.update(snapshot({ phase: 'listing', entries: [] }));
  assert.match(card.textContent, /Refreshing Orbit/i);
  dialog.update(snapshot({ phase: 'blocked', entries: [], error: { message: 'Directory permission was denied.' } }));
  assert.match(card.textContent, /permission was denied/i);
  dialog.update(snapshot({ entries: [] }));
  assert.match(card.textContent, /No top-level \.orbit files/i);
  dialog.update(snapshot({ truncated: true, entries: [entry('a', 'alpha.orbit')] }));
  assert.match(card.textContent, /truncated/i);
});

test('populated-list focus trap follows actual DOM order and preserves row focus across Refresh', () => {
  const document = new D();
  const dialog = createFileOpenBrowserDialog({ document, host: document.host, supported: true });
  dialog.show({ session: 1, dataset: 1 });
  dialog.update(snapshot(), { currentKey: 'b' });
  const overlay = document.host.children.at(-1);
  const buttons = () => overlay.querySelectorAll('button');
  const choose = buttons().find((button) => button.textContent === 'Change folder');
  const refresh = buttons().find((button) => button.textContent === 'Refresh');
  const alpha = buttons().find((button) => button.textContent === 'alpha.orbit');
  const beta = buttons().find((button) => button.textContent === 'beta.orbit');
  const elsewhere = buttons().find((button) => button.textContent === 'Open file elsewhere…');
  const close = buttons().find((button) => button.textContent === 'Close');
  choose.focus();
  overlay.keydown({ key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, close, 'Shift+Tab from first wraps to Close');
  overlay.keydown({ key: 'Tab', shiftKey: false });
  assert.equal(document.activeElement, choose, 'Tab from Close wraps to first');
  beta.focus();
  overlay.keydown({ key: 'Tab', shiftKey: false });
  assert.equal(document.activeElement, elsewhere, 'last map row does not wrap before footer');
  assert.equal(buttons().indexOf(alpha) < buttons().indexOf(elsewhere), true);
  beta.focus();
  dialog.update(snapshot({ entries: [entry('a', 'alpha.orbit'), entry('c', 'gamma.orbit')] }));
  assert.equal(document.activeElement, buttons().find((button) => button.textContent === 'alpha.orbit'), 'focus moves to a usable row when the focused row disappears');
  refresh.focus();
  dialog.update(snapshot({ entries: [entry('c', 'gamma.orbit')] }));
  assert.equal(document.activeElement, buttons().find((button) => button.textContent === 'Refresh'), 'Refresh keeps focus when no row was focused');
});
