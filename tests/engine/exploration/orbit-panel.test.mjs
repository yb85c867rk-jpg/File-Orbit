import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbitPanel } from '../../harness/m5-exploration/orbit-panel.js';

class E {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parent = null; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.hidden = false; this.disabled = false; this._text = ''; this.id = ''; this.className = ''; this.title = ''; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  click() { if (this.disabled) return; for (const fn of [...(this.listeners.get('click') || [])]) fn({ type: 'click', target: this, preventDefault() {} }); }
  focus() { this.ownerDocument.activeElement = this; }
}
class D {
  constructor() { this.activeElement = null; this.byId = new Map(); }
  createElement(tag) { return new E(tag, this); }
  addId(id) { const el = this.createElement('div'); el.id = id; this.byId.set(id, el); return el; }
  querySelector(selector) { return this.byId.get(selector.replace(/^#/, '')) || null; }
}

function build() {
  const document = new D();
  const section = document.addId('orbit-section');
  const toggle = document.addId('orbit-toggle');
  const panel = document.addId('orbit-panel'); const name = document.addId('orbit-name');
  const refresh = document.addId('orbit-refresh');
  const status = document.addId('orbit-status'); const empty = document.addId('orbit-empty'); const list = document.addId('orbit-list');
  return { document, section, toggle, panel, name, refresh, status, empty, list };
}
const entry = (key, name, lastModified = 0) => ({ key, name, size: 10, lastModified, handle: { name } });
const snapshot = (over = {}) => ({
  phase: 'ready', handle: { name: 'Orbit A' }, name: 'Orbit A', entries: [entry('a', 'a.orbit'), entry('b', 'b.orbit')],
  truncated: false, stale: false, error: null, lastRefreshedAt: 1000, ...over
});

test('closed Orbit is hidden with no list or primary Open Orbit action', () => {
  const env = build();
  const panel = createOrbitPanel({ document: env.document, onRefresh() {}, onSelect() {} });
  panel.render(snapshot({ handle: null, name: '', entries: [] }), { supported: true });
  assert.equal(env.panel.hidden, true);
  assert.equal(env.section.hidden, true);
  assert.equal(env.toggle.hidden, true);
  assert.equal(env.toggle.disabled, true);
  assert.equal(env.list.children.length, 0);
});

test('active Orbit lists top-level entries, marks current, and selects', () => {
  const env = build(); const selected = [];
  const panel = createOrbitPanel({ document: env.document, onOpen() {}, onRefresh() {}, onSelect: (value) => selected.push(value) });
  panel.render(snapshot(), { supported: true, currentKey: 'b' });
  assert.equal(env.panel.hidden, false);
  assert.equal(env.name.textContent, 'Orbit A');
  assert.equal(env.section.hidden, false);
  assert.equal(env.toggle.hidden, false);
  assert.equal(env.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(env.toggle.getAttribute('aria-label'), 'Orbit: Orbit A');
  assert.equal(env.list.children.length, 2);
  const buttons = env.list.children.map((item) => item.children[0]);
  assert.equal(buttons[0].getAttribute('aria-current'), 'false');
  assert.equal(buttons[1].getAttribute('aria-current'), 'true');
  assert.equal(buttons[0].getAttribute('aria-label'), 'Open a.orbit');
  buttons[0].click();
  assert.equal(selected[0].key, 'a');
  env.toggle.click();
  assert.equal(env.panel.hidden, true);
  assert.equal(env.toggle.getAttribute('aria-expanded'), 'false');
  env.toggle.click();
  assert.equal(env.panel.hidden, false);
  assert.equal(panel.expanded, true);
});

test('loading preserves entries and honestly marks busy/truncated/stale/empty states', () => {
  const env = build(); const panel = createOrbitPanel({ document: env.document });
  panel.render(snapshot({ phase: 'listing', stale: true, truncated: true }), { supported: true });
  assert.equal(env.list.children.length, 2);
  assert.equal(env.panel.getAttribute('aria-busy'), 'true');
  assert.equal(env.refresh.disabled, true);
  panel.render(snapshot({ stale: true }), { supported: true });
  assert.match(env.status.textContent, /out of date/i);
  panel.render(snapshot({ entries: [] }), { supported: true });
  assert.equal(env.empty.hidden, false);
  assert.match(env.empty.textContent, /No \.orbit documents/);
  panel.render(snapshot({ truncated: true, entries: [entry('a', 'a.orbit')] }), { supported: true });
  assert.match(env.status.textContent, /truncated/i);
});

test('blocked errors and unsupported capability are represented', () => {
  const env = build(); const panel = createOrbitPanel({ document: env.document });
  panel.render(snapshot({ phase: 'blocked', error: { message: 'Directory permission was denied.' }, entries: [] }), { supported: true });
  assert.match(env.status.textContent, /permission/i);
  assert.equal(env.empty.hidden, true);
  panel.render(snapshot({ handle: null, name: '', entries: [] }), { supported: false });
  assert.equal(env.section.hidden, true);
});

test('Refresh callback is wired only for active Orbit; focus survives rerender', () => {
  const env = build(); const calls = [];
  const panel = createOrbitPanel({ document: env.document, onRefresh: () => calls.push('refresh') });
  panel.render(snapshot(), { supported: true });
  env.refresh.click();
  assert.deepEqual(calls, ['refresh']);
  const first = env.list.children[0].children[0]; first.focus();
  panel.render(snapshot(), { supported: true });
  assert.equal(env.document.activeElement, env.list.children[0].children[0], 'focused entry is restored');
});
