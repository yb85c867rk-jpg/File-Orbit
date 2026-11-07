import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreateMapDialog } from '../../harness/m5-exploration/create-map-dialog.js';

class El {
  constructor(tag = 'div') { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.listeners = new Map(); this.className = ''; this.id = ''; this.hidden = false; this.disabled = false; this._textContent = ''; this.value = ''; this.type = ''; this.isConnected = true; this.offsetParent = {}; this.offsetWidth = 40; this.offsetHeight = 16; this.maxLength = 0; }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  appendChild(child) { child.parent = this; this.children.push(child); child.ownerDocument = this.ownerDocument; return child; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  async click() { if (!this.disabled) await this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
}
class Doc {
  constructor() { this.documentElement = new El('html'); this.activeElement = null; this.listeners = new Map(); this.defaultView = { getComputedStyle: (node) => ({ display: node.hidden ? 'none' : 'block', visibility: node.style.visibility === 'hidden' ? 'hidden' : 'visible' }) }; }
  createElement(tag) { const el = new El(tag); el.ownerDocument = this; return el; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async keydown(event) { for (const fn of [...(this.listeners.get('keydown') || [])]) await fn({ preventDefault() {}, ...event }); }
}
function walk(node, out = []) { out.push(node); for (const child of node.children) walk(child, out); return out; }
function button(root, text) { return walk(root).find((node) => node.tagName === 'BUTTON' && node.textContent === text); }
function byClass(root, name) { return walk(root).find((node) => String(node.className).split(/\s+/).includes(name)); }
function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
const flush = () => new Promise((resolve) => setImmediate(resolve));
const candidate = (name) => ({ ok: true, tree: { name, kind: 'folder', data: {}, children: [] }, registry: { clear() {} }, datasetToken: 1 });
function setup() {
  const document = new Doc(); const host = document.createElement('div');
  const libraries = [{ id: 'a', name: 'A', handle: { name: 'A' } }, { id: 'b', name: 'B', handle: { name: 'B' } }];
  const names = []; const created = []; let cancels = 0;
  const dialog = createCreateMapDialog({ document, host, hasCurrentMap: () => true,
    getLibraries: () => libraries, getDefaultLibraryId: () => 'a',
    onNameChange: (request) => { const d = deferred(); names.push({ request, ...d }); return d.promise; },
    onCreate: async (preview, destination) => { created.push({ name: preview.tree.name, id: destination.id }); return { ok: true }; },
    onCancel: () => { cancels += 1; } });
  dialog.show();
  const section = host.children[0].children[0];
  const title = walk(section).find((node) => node.tagName === 'INPUT' && node.type === 'text');
  return { document, host, section, dialog, title, names, created, get cancels() { return cancels; } };
}
async function type(env, value) { env.title.value = value; await env.title.dispatch('input'); await flush(); }

test('latest title owns the preview; an older title cannot replace it', async () => {
  const env = setup();
  await type(env, 'A');
  await type(env, 'AB');
  assert.equal(env.names.length, 2);
  env.names[1].resolve(candidate('AB')); await flush();
  env.names[0].resolve(candidate('A')); await flush();
  assert.equal(button(env.section, 'Create Map').disabled, false);
  assert.equal(byClass(env.section, 'create-map-status').textContent, '');
  assert.equal(button(env.section, 'Create Map').disabled, false);
  await button(env.section, 'Create Map').click();
  await button(env.section, 'Replace map').click(); await flush();
  assert.deepEqual(env.created, [{ name: 'AB', id: 'a' }]);
});

test('invalid latest title clears readiness and never submits', async () => {
  const env = setup();
  await type(env, 'Valid');
  env.names[0].resolve(candidate('Valid')); await flush();
  assert.equal(button(env.section, 'Create Map').disabled, false);
  await type(env, '   ');
  assert.equal(button(env.section, 'Create Map').disabled, true);
  await env.document.keydown({ key: 'Escape' });
  assert.equal(env.host.children[0].hidden, true);
  assert.equal(env.created.length, 0);
});

test('cancel/reopen invalidates old preparation ownership', async () => {
  const env = setup();
  await type(env, 'Old');
  await env.document.keydown({ key: 'Escape' });
  env.dialog.show();
  env.names[0].resolve(candidate('Old')); await flush();
  assert.equal(env.created.length, 0);
  await type(env, 'New');
  env.names[1].resolve(candidate('New')); await flush();
  await button(env.section, 'Create Map').click();
  await button(env.section, 'Replace map').click(); await flush();
  assert.deepEqual(env.created, [{ name: 'New', id: 'a' }]);
});

test('destination selection stays local and survives refresh', async () => {
  const env = setup();
  await byClass(env.section, 'create-map-library-toggle').click();
  const options = walk(env.section).filter((node) => node.className === 'create-map-library-option');
  await options[1].click();
  assert.equal(byClass(env.section, 'create-map-selected-destination').textContent, 'B');
  await type(env, 'Keep');
  env.names[0].resolve(candidate('Keep')); await flush();
  await button(env.section, 'Refresh').click(); await flush();
  assert.equal(byClass(env.section, 'create-map-selected-destination').textContent, 'B');
  assert.equal(env.title.value, 'Keep');
});
