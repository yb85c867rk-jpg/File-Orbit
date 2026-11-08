import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreateMapDialog } from '../../harness/m5-exploration/create-map-dialog.js';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.listeners = new Map(); this._textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.files = []; this.parent = null; this.id = ''; this.offsetParent = null; this.isConnected = true; this.focusCount = 0; this.type = ''; this.maxLength = 0; }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  async click() { await this.dispatch('click'); }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
}
class FakeDocument {
  constructor() { this.documentElement = new FakeElement('html'); this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { const el = new FakeElement(tag); el.ownerDocument = this; return el; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async keydown(event) { for (const fn of [...(this.listeners.get('keydown') || [])]) await fn({ preventDefault() {}, ...event }); }
}
function walk(node, out = []) { out.push(node); for (const child of node.children) walk(child, out); return out; }
function findButton(host, text) { return walk(host.children[0]).find((node) => node.tagName === 'BUTTON' && node.textContent === text); }
function findClass(host, name) { return walk(host.children[0]).find((node) => String(node.className).split(/\s+/).includes(name)); }
function input(host, tag) { return walk(host.children[0]).find((node) => node.tagName === tag); }
function setup({ hasCurrentMap = true, libraries = [{ id: 'lib-a', name: 'Library A', handle: { name: 'Library A' } }, { id: 'lib-b', name: 'Library B', handle: { name: 'Library B' } }], selectedId = 'lib-a' } = {}) {
  const document = new FakeDocument(); const host = document.createElement('div');
  const calls = { names: [], creates: [], cancels: 0, links: 0, refreshes: 0 };
  const dialog = createCreateMapDialog({ document, host,
    onNameChange: async ({ mapName, description }) => { calls.names.push(mapName); return { ok: true, tree: { name: mapName, kind: 'folder', data: { description }, children: [] }, registry: { clear() {} }, datasetToken: 1, stats: { folderCount: 1, fileCount: 0, totalBytes: 0 } }; },
    onCreate: async (candidate, destination) => { calls.creates.push({ name: candidate.tree.name, id: destination?.id, handle: destination?.handle }); return { ok: true }; },
    onCancel: () => { calls.cancels += 1; },
    getFallbackFocus: () => null,
    hasCurrentMap: () => hasCurrentMap,
    getLibraries: () => libraries,
    getDefaultLibraryId: () => selectedId,
    onChooseDestination: async () => { calls.links += 1; return { ok: true, destination: { id: null, name: 'Library C', handle: { name: 'Library C' }, draft: true, token: 1 } }; },
    onRefreshLibraries: async () => { calls.refreshes += 1; return { ok: true }; }
  });
  return { document, host, dialog, calls, libraries };
}
test('root-only form lists shared Libraries, defaults to the selected destination, and creates once', async () => {
  const { document, host, dialog, calls } = setup();
  const trigger = new FakeElement('button'); trigger.ownerDocument = document; document.activeElement = trigger;
  dialog.show();
  const files = walk(host.children[0]).filter((node) => node.tagName === 'INPUT' && node.type === 'file');
  assert.equal(files.length, 0);
  assert.equal(findClass(host, 'create-map-drop'), undefined);
  assert.equal(findClass(host, 'create-map-source'), undefined);
  assert.equal(findClass(host, 'create-map-library-option').tagName, 'BUTTON');
  assert.equal(findClass(host, 'create-map-library-list').hidden, true);
  assert.equal(findClass(host, 'create-map-library-toggle').getAttribute('aria-expanded'), 'false');
  const destination = findClass(host, 'create-map-selected-destination');
  assert.equal(destination.textContent, 'Library A');
  const title = input(host, 'INPUT'); const description = input(host, 'TEXTAREA');
  title.value = 'Root Map'; title.dispatch('input'); description.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const create = findButton(host, 'Create Map');
  assert.equal(create.disabled, false);
  await create.click();
  assert.equal(findClass(host, 'create-map-confirm').hidden, false);
  await findButton(host, 'Replace map').click();
  await findButton(host, 'Replace map').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.creates.length, 1);
  assert.deepEqual(calls.creates[0], { name: 'Root Map', id: 'lib-a', handle: { name: 'Library A' } });
  assert.equal(calls.cancels, 1);
});
test('choosing another linked Library changes only the form destination; + New stages C without linking it', async () => {
  const { host, dialog, calls } = setup({ hasCurrentMap: false });
  dialog.show();
  const title = input(host, 'INPUT'); title.value = 'Draft'; title.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await findClass(host, 'create-map-library-toggle').click();
  assert.equal(findClass(host, 'create-map-library-list').hidden, false);
  const options = walk(host.children[0]).filter((node) => node.className === 'create-map-library-option');
  await options[1].click();
  assert.equal(findClass(host, 'create-map-selected-destination').textContent, 'Library B');
  assert.equal(findClass(host, 'create-map-library-list').hidden, true);
  assert.equal(options[1].getAttribute('aria-pressed'), 'true');
  assert.equal(options[0].getAttribute('aria-pressed'), 'false');
  assert.equal(calls.creates.length, 0);
  assert.equal(findClass(host, 'create-map-form').hidden, false);
  await findButton(host, '+ New').click();
  assert.equal(calls.links, 1);
  assert.equal(findClass(host, 'create-map-selected-destination').textContent, 'Library C');
  await findClass(host, 'create-map-library-toggle').click();
  await findButton(host, 'Refresh').click();
  assert.equal(calls.refreshes, 1);
  assert.equal(title.value, 'Draft');
  assert.equal(findClass(host, 'create-map-selected-destination').textContent, 'Library C');
});
test('invalid title and Escape/cancel keep the draft discarded and never submit', async () => {
  const { document, host, dialog, calls } = setup({ hasCurrentMap: false });
  dialog.show();
  const title = input(host, 'INPUT'); title.value = '   '; title.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(findButton(host, 'Create Map').disabled, true);
  assert.equal(calls.creates.length, 0);
  title.value = 'Valid'; title.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await document.keydown({ key: 'Escape' });
  assert.equal(host.children[0].hidden, true);
  assert.equal(calls.cancels, 1);
  assert.equal(calls.creates.length, 0);
});
test('no current map creates directly; cancel and reopen isolate prior preparation', async () => {
  const { host, dialog, calls } = setup({ hasCurrentMap: false });
  dialog.show();
  const title = input(host, 'INPUT'); title.value = 'Direct'; title.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await findButton(host, 'Create Map').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.creates.length, 1);
  dialog.show();
  assert.equal(findButton(host, 'Create Map').disabled, true);
  await findButton(host, 'Cancel').click();
  assert.equal(calls.cancels, 2);
});


