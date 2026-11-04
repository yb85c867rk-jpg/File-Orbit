import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreateMapDialog } from '../../harness/m5-exploration/create-map-dialog.js';

class FakeDialogElement {
  constructor(tag = 'div', ownerDocument = null) {
    this.tagName = String(tag).toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parent = null;
    this.dataset = {}; this.attributes = new Map(); this.style = {}; this.listeners = new Map();
    this.className = ''; this.id = ''; this.hidden = false; this.disabled = false; this._textContent = '';
    this.value = ''; this.type = ''; this.files = []; this.tabIndex = 0; this.isConnected = true;
    this.offsetWidth = 40; this.offsetHeight = 16; this.offsetParent = {};
  }
  get parentElement() { return this.parent; }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  appendChild(child) { child.parent = this; this.children.push(child); child.ownerDocument = this.ownerDocument; return child; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.parent?.removeChild?.(this); this.parent = null; this.isConnected = false; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parent = null; return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); if (name === 'hidden') this.hidden = true; if (name === 'disabled') this.disabled = true; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  async click() { if (this.disabled) return; await this.dispatch('click'); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
  querySelector(selector) { return find(this, selector); }
  querySelectorAll(selector) { return findAll(this, selector); }
}
class FakeDialogDocument {
  constructor() {
    this.documentElement = new FakeDialogElement('html', this); this.body = new FakeDialogElement('body', this); this.documentElement.appendChild(this.body);
    this.activeElement = null; this.listeners = new Map();
    this.defaultView = { getComputedStyle: (node) => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }) };
  }
  createElement(tag) { return new FakeDialogElement(tag, this); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
}
function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  return node.tagName === selector.toUpperCase();
}
function find(root, selector) { for (const child of root.children) { if (matches(child, selector)) return child; const found = find(child, selector); if (found) return found; } return null; }
function findAll(root, selector, out = []) { for (const child of root.children) { if (matches(child, selector)) out.push(child); findAll(child, selector, out); } return out; }
function textOf(node) { return `${node.textContent} ${node.children.map((child) => textOf(child)).join(' ')}`; }
function deferred() { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function file(name) { return { name, webkitRelativePath: name, type: 'text/plain', size: 1 }; }
function result(marker) {
  return { ok: true, tree: { kind: 'folder', name: marker, children: [{ kind: 'file', name: `${marker}.txt` }] }, stats: { folderCount: 1, fileCount: 1, totalBytes: 1 } };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const document = new FakeDialogDocument();
  const host = document.createElement('div'); document.body.appendChild(host);
  const selections = []; const names = []; const created = []; const cancels = [];
  let dropHandler = async () => ({ ok: false, message: 'unsupported' });
  const dialog = createCreateMapDialog({
    document, host, hasCurrentMap: () => true,
    onSelection: (request) => { const d = deferred(); selections.push({ request, ...d }); return d.promise; },
    onNameChange: (request) => { const d = deferred(); names.push({ request, ...d }); return d.promise; },
    onCreate: async (candidate) => { created.push(candidate); return { ok: true }; },
    onCancel: () => cancels.push(true)
  });
  dialog.setDropEntryHandler((request) => dropHandler(request));
  dialog.show();
  const backdrop = host.children[0];
  const section = backdrop.children[0];
  const fileInput = findAll(section, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
  const nameInput = findAll(section, 'input').find((input) => input.type === 'text');
  const drop = section.querySelector('.create-map-drop');
  const button = (text) => findAll(section, 'button').find((item) => item.textContent === text);
  const create = button('Create Map'); const replace = button('Replace map'); const back = button('Back');
  return { document, host, dialog, backdrop, section, fileInput, nameInput, drop, create, replace, back, selections, names, created, cancels, setDropHandler: (fn) => { dropHandler = fn; } };
}
function pick(env, name) { env.fileInput.files = [file(name)]; return env.fileInput.dispatch('change'); }
function itemDrop(env, name) { return env.drop.dispatch('drop', { dataTransfer: { items: [{ kind: 'file', getAsFile: () => file(name) }], files: [] } }); }
function entryDrop(env, name) { return env.drop.dispatch('drop', { dataTransfer: { items: [{ kind: 'file', webkitGetAsEntry: () => ({ name }) }], files: [] } }); }

test('picker A pending then item drop B: B owns the preview and is submitted once', async () => {
  const env = setup();
  await pick(env, 'A.txt');
  await itemDrop(env, 'B.txt');
  env.selections[1].resolve(result('B'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /B/);
  env.selections[0].resolve(result('A'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /B/);
  assert.doesNotMatch(textOf(env.section.querySelector('.create-map-preview')), /A/);
  await env.create.click();
  await env.replace.click();
  await flush();
  assert.equal(env.created.length, 1);
  assert.equal(env.created[0].tree.name, 'B');
});

test('reverse completion: A resolves while B is pending; B remains the only installable candidate', async () => {
  const env = setup();
  await pick(env, 'A.txt');
  await itemDrop(env, 'B.txt');
  env.selections[0].resolve(result('A'));
  await flush();
  assert.equal(env.create.disabled, true);
  assert.match(textOf(env.section.querySelector('.create-map-status')), /Preparing preview/);
  env.selections[1].resolve(result('B'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /B/);
});

test('directory drop A then B: B wins, and obsolete A rejection cannot replace B status', async () => {
  const env = setup();
  const a = deferred(); const b = deferred();
  env.setDropHandler((request) => request.entries[0].name === 'A' ? a.promise : b.promise);
  await entryDrop(env, 'A');
  await entryDrop(env, 'B');
  b.resolve(result('B'));
  await flush();
  assert.equal(env.create.disabled, false);
  a.reject(new Error('A failed late'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-status')), /Review, then choose Create Map/);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /B/);
});

test('name changes are latest-wins and invalid latest name blocks creation', async () => {
  const env = setup();
  const first = env.selections[0] = { request: null, ...deferred() };
  // Install a valid base preview first.
  await pick(env, 'Base.txt');
  env.selections.at(-1).resolve(result('Base'));
  env.selections.splice(0, 1);
  await flush();
  assert.equal(env.create.disabled, false);
  env.nameInput.value = 'One'; await env.nameInput.dispatch('input');
  assert.equal(env.names.length, 1);
  env.nameInput.value = 'Two'; await env.nameInput.dispatch('input');
  assert.equal(env.names.length, 2);
  assert.equal(env.create.disabled, true);
  env.names[0].resolve(result('One'));
  await flush();
  assert.equal(env.create.disabled, true);
  env.names[1].resolve(result('Two'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /Two/);
  env.nameInput.value = ''; await env.nameInput.dispatch('input');
  assert.equal(env.create.disabled, true);
  assert.match(env.section.querySelector('.create-map-name-error').textContent, /\S/);
});

test('close/reopen isolates preparation ownership and reservations by session', async () => {
  const env = setup();
  await pick(env, 'A.txt');
  const a = env.selections[0];
  env.dialog.close({ restoreFocus: false });
  env.dialog.show();
  await pick(env, 'B.txt');
  const b = env.selections[1];
  a.resolve(result('A'));
  await flush();
  assert.equal(env.backdrop.hidden, false);
  assert.equal(env.create.disabled, true);
  assert.match(textOf(env.section.querySelector('.create-map-status')), /Preparing preview/);
  assert.equal(env.section.querySelector('.create-map-preview').children.length, 0);
  b.resolve(result('B'));
  await flush();
  assert.equal(env.create.disabled, false);
  await env.create.click(); await env.replace.click(); await flush();
  assert.equal(env.created.length, 1); assert.equal(env.created[0].tree.name, 'B');
});

test('cancel and destroy ignore late preparation and never submit', async () => {
  const env = setup();
  await pick(env, 'A.txt');
  const a = env.selections[0];
  env.dialog.close({ restoreFocus: false });
  a.resolve(result('A'));
  await flush();
  assert.equal(env.created.length, 0);
  assert.equal(env.backdrop.hidden, true);
  assert.equal(env.cancels.length, 1);
  env.dialog.show();
  await pick(env, 'C.txt');
  const c = env.selections[1];
  env.dialog.destroy();
  c.resolve(result('C'));
  await flush();
  assert.equal(env.created.length, 0);
});test('directory drop reverse completion: A finishing while B is pending cannot own the preview', async () => {
  const env = setup();
  const a = deferred(); const b = deferred();
  env.setDropHandler((request) => request.entries[0].name === 'A' ? a.promise : b.promise);
  await entryDrop(env, 'A');
  await entryDrop(env, 'B');
  a.resolve(result('A'));
  await flush();
  assert.equal(env.create.disabled, true);
  assert.match(textOf(env.section.querySelector('.create-map-status')), /Reading dropped folders/);
  assert.equal(env.section.querySelector('.create-map-preview').children.length, 0);
  b.resolve(result('B'));
  await flush();
  assert.equal(env.create.disabled, false);
  assert.match(textOf(env.section.querySelector('.create-map-preview')), /B/);
});

