import { createPersistenceRepository, buildRecoverySnapshot, createAttachmentId } from '../../../src/engine/hypertree/persistence/index.js';
import { encodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeIndexedDB } from '../persistence/fake-indexeddb.mjs';

const writeLifecycleMarker = (text) => { const file = process.env.LIFECYCLE_MARKER_FILE; if (file) writeFileSync(file, text + '\n'); };
class FakeElement {
  constructor(tag = 'div', ownerDocument = null) {
    this.tagName = String(tag).toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parent = null;
    this.dataset = {}; this.attributes = new Map(); this.style = {}; this.listeners = new Map();
    this.className = ''; this.id = ''; this.hidden = false; this.disabled = false; this._textContent = '';
    this._clientWidth = 1100; this._clientHeight = 473; this.offsetWidth = 40; this.offsetHeight = 16;
    this.offsetParent = {}; this.isConnected = true; this.files = []; this.value = ''; this.type = '';
  }
  get clientWidth() { return hasLayout(this) ? this._clientWidth : 0; }
  get clientHeight() { return hasLayout(this) ? this._clientHeight : 0; }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  appendChild(child) { child.parent = this; this.children.push(child); child.ownerDocument = this.ownerDocument; return child; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parent = null; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.parent?.removeChild(this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); if (name === 'hidden') this.hidden = true; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
  async dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  async click() { this.clickCount = (this.clickCount || 0) + 1; if (this.disabled) return; await this.dispatch('click'); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  setPointerCapture() {} releasePointerCapture() {}
  contains(target) { return target === this || this.children.some((child) => child.contains?.(target)); }
  closest(selector) { for (let node = this; node; node = node.parent) if (matches(node, selector)) return node; return null; }
  getBoundingClientRect() { const width = hasLayout(this) ? this.offsetWidth : 0; const height = hasLayout(this) ? this.offsetHeight : 0; const left = Number.parseFloat(this.style?.left) || (this.parent ? Number.parseFloat(this.parent.style?.left) || 0 : 0); const top = Number.parseFloat(this.style?.top) || (this.parent ? Number.parseFloat(this.parent.style?.top) || 0 : 0); return { left, top, right: left + width, bottom: top + height, width, height }; }
  getContext() { const target = {}; return new Proxy(target, { get: (t, prop) => { if (prop === 'measureText') return () => ({ width: 0 }); if (prop === 'createLinearGradient') return () => ({ addColorStop() {} }); if (prop in t) return t[prop]; return (...args) => { if (globalThis.__FAIL_DRAW__ && (prop === 'clearRect' || prop === 'fill' || prop === 'stroke')) throw new Error('draw-failed'); }; }, set: (t, prop, value) => { t[prop] = value; if ((prop === 'fillStyle' || prop === 'strokeStyle') && globalThis.__CANVAS_COLORS__) globalThis.__CANVAS_COLORS__.push(String(value)); return true; } }); }
  setPointerCapture() {} releasePointerCapture() {}
  querySelector(selector) { return find(this, selector); }
  querySelectorAll(selector) { return findAll(this, selector); }
}
function hasLayout(node) { for (let current = node; current; current = current.parent) { if (current.hidden || current.style?.display === 'none') return false; } return true; }
function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const m = selector.slice(1, -1).match(/^([^="]+)(?:="([^"]*)")?$/);
    if (!m) return false;
    const key = m[1];
    if (key.startsWith('data-')) { const value = node.dataset[key.slice(5)] ?? node.getAttribute(key); return m[2] === undefined ? value !== undefined && value !== null : String(value ?? '') === m[2]; }
    return node.getAttribute(key) === (m[2] ?? '');
  }
  if (selector === 'button:not([disabled])') return node.tagName === 'BUTTON' && !node.disabled;
  return node.tagName === selector.toUpperCase();
}
function find(root, selector) { for (const child of root.children) { if (matches(child, selector)) return child; const found = find(child, selector); if (found) return found; } return null; }
function findAll(root, selector, out = []) {
  const parts = String(selector).trim().split(/\s+/);
  if (parts.length > 1) {
    const anchors = findAll(root, parts[0]);
    for (const anchor of anchors) findAll(anchor, parts.slice(1).join(' '), out);
    return [...new Set(out)];
  }
  for (const child of root.children) { if (matches(child, selector)) out.push(child); findAll(child, selector, out); }
  return out;
}
function textOf(node) { return String(node.textContent) + ' ' + node.children.map((child) => textOf(child)).join(' '); }
class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this); this.body = new FakeElement('body', this); this.documentElement.appendChild(this.body);
    this.activeElement = null; this.listeners = new Map(); this.fullscreenEnabled = true; this.fullscreenElement = null;
    this.defaultView = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(_ns, tag) { return new FakeElement(tag, this); }
  querySelector(selector) { return find(this.body, selector); }
  querySelectorAll(selector) { return findAll(this.body, selector); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== fn)); }
}
function add(doc, parent, tag, id, className = '') { const el = doc.createElement(tag); el.id = id; el.className = className; parent.appendChild(el); return el; }
function addButton(doc, parent, label, action = null, available = 'true') { const el = add(doc, parent, 'button', ''); el.textContent = label; if (action) { el.dataset.action = action; el.dataset.available = available; } parent.appendChild(el); return el; }
function buildDocument() {
  const doc = new FakeDocument();
  const root = add(doc, doc.body, 'div', 'app-root');
  root.requestFullscreen = async () => { doc.fullscreenElement = root; for (const fn of doc.listeners.get('fullscreenchange') || []) fn({ type: 'fullscreenchange' }); };
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; for (const fn of doc.listeners.get('fullscreenchange') || []) fn({ type: 'fullscreenchange' }); };
  const header = add(doc, root, 'header', 'app-header');
  const brand = add(doc, header, 'h1', 'brand'); brand.textContent = 'FileOrbit';
  const desktop = add(doc, header, 'div', 'desktop-map-actions');
  const saveState = add(doc, header, 'span', 'save-state');
  const storageHelp = add(doc, header, 'button', 'storage-help'); storageHelp.textContent = '?'; storageHelp.setAttribute('aria-expanded', 'false');
  const storageHelpText = add(doc, header, 'span', 'storage-help-text'); storageHelpText.textContent = ''; storageHelpText.hidden = true;
  const backupCancel = add(doc, header, 'button', 'backup-cancel'); backupCancel.textContent = 'Cancel backup'; backupCancel.hidden = true;
  const desktopCreate = addButton(doc, desktop, 'Create Map', 'create-map');
  const desktopSave = addButton(doc, desktop, 'Save', 'save-map', 'false'); const desktopOpen = addButton(doc, desktop, 'Open', 'open-map');
  addButton(doc, desktop, 'Upload', 'upload', 'true'); addButton(doc, desktop, 'Download', 'download', 'true');
const desktopOpenDocument = addButton(doc, desktop, 'Open File', 'open-document'); const desktopSaveAs = addButton(doc, desktop, 'Save As', 'save-document-as', 'false');
  const dev = add(doc, header, 'div', 'dev-controls'); const fixture = add(doc, dev, 'select', 'fixture'); const f20 = doc.createElement('option'); f20.value = 'f20'; f20.textContent = 'F20'; fixture.appendChild(f20); fixture.value = 'f20';
  const fitButton = addButton(doc, dev, 'Fit'); fitButton.id = 'fit';
  add(doc, header, 'span', 'counts');
  const mapMenuButton = addButton(doc, header, 'Map'); mapMenuButton.id = 'map-menu-button';
  const mapMenu = add(doc, header, 'div', 'map-menu'); mapMenu.hidden = true; const mobileCreate = addButton(doc, mapMenu, 'Create Map', 'create-map'); const mobileSave = addButton(doc, mapMenu, 'Save', 'save-map', 'false'); const mobileOpen = addButton(doc, mapMenu, 'Open', 'open-map');
  addButton(doc, mapMenu, 'Upload', 'upload', 'true');
  const moreMenuButton = addButton(doc, header, 'More'); moreMenuButton.id = 'more-menu-button';
  const moreMenu = add(doc, header, 'div', 'more-menu'); moreMenu.hidden = true; const themeMobile = addButton(doc, moreMenu, 'Theme: Light'); themeMobile.id = 'theme-mobile'; themeMobile.dataset.action = 'theme';
  const status = add(doc, header, 'div', 'shell-status');
  add(doc, root, 'div', 'error');
  const layout = add(doc, root, 'div', 'layout');
  const graphWrap = add(doc, layout, 'div', 'graph-wrap');
  const actionToolbar = add(doc, graphWrap, 'div', 'graph-action-toolbar'); actionToolbar.offsetHeight = 42;
  const searchToggle = addButton(doc, actionToolbar, 'Search'); searchToggle.id = 'search-toggle'; searchToggle.dataset.presentation = 'icon'; searchToggle.setAttribute('aria-expanded', 'false');
  const searchPanel = add(doc, actionToolbar, 'div', 'search-panel'); searchPanel.hidden = true;
  const search = add(doc, searchPanel, 'input', 'search-reserved'); search.type = 'search'; search.disabled = false;
  const searchClose = addButton(doc, searchPanel, 'Close search'); searchClose.id = 'search-close'; searchClose.dataset.presentation = 'icon';
  const undo = addButton(doc, actionToolbar, 'Undo'); undo.id = 'undo-history'; undo.dataset.presentation = 'icon'; const redo = addButton(doc, actionToolbar, 'Redo'); redo.id = 'redo-history'; redo.dataset.presentation = 'icon';
  const embed = addButton(doc, actionToolbar, 'Embed', 'embed', 'false'); embed.id = 'embed-action'; embed.dataset.presentation = 'icon'; const fullscreen = addButton(doc, actionToolbar, 'button', 'fullscreen'); fullscreen.id = 'fullscreen-action'; fullscreen.className = 'graph-action-button'; fullscreen.dataset.presentation = 'icon'; fullscreen.setAttribute('aria-label', 'Enter fullscreen'); fullscreen.title = 'Enter fullscreen'; fullscreen.setAttribute('data-tooltip', 'Enter fullscreen'); const fullscreenIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); fullscreenIcon.setAttribute('viewBox', '0 0 20 20'); fullscreenIcon.setAttribute('aria-hidden', 'true'); fullscreenIcon.setAttribute('focusable', 'false'); fullscreen.appendChild(fullscreenIcon); const fullscreenGlyph = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); fullscreenGlyph.id = 'fullscreen-glyph'; fullscreenGlyph.setAttribute('d', 'M7 3H3v4m10-4h4v4M7 17H3v-4m10 4h4v-4'); fullscreenGlyph.setAttribute('fill', 'none'); fullscreenGlyph.setAttribute('stroke', 'currentColor'); fullscreenGlyph.setAttribute('stroke-width', '1.7'); fullscreenIcon.appendChild(fullscreenGlyph);
  const copyButton = addButton(doc, actionToolbar, 'Copy Map', 'copy-map', 'false'); copyButton.id = 'copy-map'; copyButton.dataset.presentation = 'icon';
 const downloadButton = addButton(doc, actionToolbar, 'Download', 'download', 'true'); downloadButton.id = 'download-backup'; downloadButton.dataset.available = 'true';
  add(doc, actionToolbar, 'span', 'history-status');
  add(doc, graphWrap, 'div', 'graph-action-tooltip');
  add(doc, root, 'div', 'nav-rail-tooltip');
  const graphViewport = add(doc, graphWrap, 'div', 'graph-viewport'); graphViewport._clientHeight = 431;
  const emptyState = add(doc, graphViewport, 'div', 'empty-state'); const emptyHeading = add(doc, emptyState, 'h2', ''); emptyHeading.textContent = 'Create a map to get started'; addButton(doc, emptyState, 'Create Map', 'create-map');
  const graphHost = add(doc, graphViewport, 'div', 'graph-host'); graphHost._clientHeight = 431; const labelHost = add(doc, graphViewport, 'div', 'label-host'); labelHost._clientHeight = 431;
  add(doc, graphViewport, 'div', 'drag-feedback'); add(doc, graphViewport, 'div', 'drag-ghost'); add(doc, graphViewport, 'div', 'drag-target');
  const aside = add(doc, layout, 'aside', 'details-panel'); aside.dataset.collapsed = 'false';
  const detailsHead = add(doc, aside, 'div', 'details-head'); add(doc, detailsHead, 'h2', '');
  const detailsToggle = addButton(doc, detailsHead, 'Hide details'); detailsToggle.id = 'details-toggle'; detailsToggle.setAttribute('aria-expanded', 'true'); detailsToggle.textContent = ''; const detailsToggleLabel = doc.createElement('span'); detailsToggleLabel.id = 'details-toggle-label'; detailsToggleLabel.textContent = 'Hide details'; detailsToggle.appendChild(detailsToggleLabel); const detailsToggleIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); detailsToggleIcon.className = 'details-toggle-icon'; detailsToggleIcon.id = 'details-toggle-icon'; detailsToggle.appendChild(detailsToggleIcon);
  const detailsContent = add(doc, aside, 'div', 'details-content'); add(doc, detailsContent, 'div', 'details'); add(doc, detailsContent, 'div', 'editor-host'); add(doc, detailsContent, 'div', 'search-results-host'); const searchHighlightStatus = add(doc, detailsContent, 'p', 'search-highlight-status'); searchHighlightStatus.id = 'search-highlight-status'; searchHighlightStatus.setAttribute('role', 'status'); searchHighlightStatus.setAttribute('aria-live', 'polite');
  const nav = add(doc, layout, 'nav', 'nav-rail'); nav.id = 'nav-rail'; nav.dataset.expanded = 'false';
  const navToggle = addButton(doc, nav, 'Expand'); navToggle.id = 'nav-rail-toggle'; navToggle.setAttribute('aria-expanded', 'false'); const navToggleLabel = doc.createElement('span'); navToggleLabel.id = 'nav-rail-toggle-label'; navToggleLabel.textContent = 'Expand'; navToggle.appendChild(navToggleLabel);
  const navItems = add(doc, nav, 'div', 'nav-rail-items'); navItems.id = 'nav-rail-items';
  addButton(doc, navItems, 'Create Map', 'create-map');
  const openOrbitRow = add(doc, navItems, 'div', 'open-orbit-row'); const openOrbitButton = addButton(doc, openOrbitRow, 'Open Orbit'); openOrbitButton.id = 'open-orbit-action'; openOrbitButton.setAttribute('aria-label', 'Open Orbit'); openOrbitButton.setAttribute('aria-haspopup', 'menu'); openOrbitButton.setAttribute('aria-expanded', 'false'); openOrbitButton.setAttribute('aria-controls', 'open-orbit-menu'); openOrbitButton.title = 'Open Orbit: choose Orbit File or Orbit Folder'; const openOrbitMenu = add(doc, openOrbitRow, 'div', 'popup-menu'); openOrbitMenu.id = 'open-orbit-menu'; openOrbitMenu.hidden = true; openOrbitMenu.setAttribute('role', 'menu'); const orbitFile = addButton(doc, openOrbitMenu, 'Orbit File'); orbitFile.setAttribute('role', 'menuitem'); orbitFile.dataset.openKind = 'file'; orbitFile.setAttribute('data-open-kind', 'file'); const orbitFolder = addButton(doc, openOrbitMenu, 'Orbit Folder'); orbitFolder.setAttribute('role', 'menuitem'); orbitFolder.dataset.openKind = 'folder'; orbitFolder.setAttribute('data-open-kind', 'folder'); openOrbitMenu.replaceChildren(orbitFile, orbitFolder);
  addButton(doc, navItems, 'Save As', 'save-document-as', 'false');
  const helpButton = addButton(doc, openOrbitRow, '?'); helpButton.id = 'open-orbit-help'; helpButton.setAttribute('aria-label', 'About Orbit files'); helpButton.setAttribute('aria-expanded', 'false'); helpButton.setAttribute('aria-controls', 'open-orbit-help-text'); const helpText = add(doc, openOrbitRow, 'div', 'open-orbit-help-text'); helpText.id = 'open-orbit-help-text'; helpText.hidden = true; helpText.setAttribute('role', 'tooltip'); helpText.textContent = 'Open Orbit offers Orbit File for one .orbit file, or Orbit Folder to connect a folder and list its .orbit files in the sidebar.';
  if (process.env.OPEN_WORKFLOW || process.env.ORBIT_UI || process.env.ORBIT_R1 || process.env.ORBIT_R2 || process.env.ORBIT_CREATE || process.env.ORBIT_ADD || process.env.ORBIT_FAIL || process.env.FILE_OPEN_NAV || process.env.FILE_OPEN_NAV_UNSUPPORTED || process.env.FILE_OPEN_BROWSER_STALE || process.env.ORBIT_MENU || process.env.CREATE_LOCATION || process.env.CREATE_LOCATION_STALE || process.env.COPY_MAP || process.env.COPY_MAP_STALE || process.env.COPY_MAP_ENCODE || process.env.ORBIT_ONLY || process.env.AUTO_CONFLICT) {
    const orbitSection = add(doc, navItems, 'div', 'orbit-section'); orbitSection.id = 'orbit-section'; orbitSection.hidden = true;
    const orbitToggle = addButton(doc, orbitSection, 'Orbit maps'); orbitToggle.id = 'orbit-toggle'; orbitToggle.setAttribute('aria-expanded', 'false'); orbitToggle.setAttribute('aria-controls', 'orbit-panel');
    const orbitName = add(doc, orbitToggle, 'span', 'orbit-name'); orbitName.id = 'orbit-name'; orbitName.textContent = 'No Orbit';
    const orbitPanel = add(doc, orbitSection, 'div', 'orbit-panel'); orbitPanel.id = 'orbit-panel'; orbitPanel.hidden = true; orbitPanel.setAttribute('tabindex', '-1');
    addButton(doc, orbitPanel, 'Refresh list').id = 'orbit-refresh';
    const orbitEmpty = add(doc, orbitPanel, 'p', 'orbit-empty'); orbitEmpty.id = 'orbit-empty'; orbitEmpty.hidden = true;
    const orbitList = add(doc, orbitPanel, 'ul', 'orbit-list'); orbitList.id = 'orbit-list';
    const orbitStatus = add(doc, orbitPanel, 'p', 'orbit-status'); orbitStatus.id = 'orbit-status';
  }
  const settingsButton = addButton(doc, navItems, 'Settings'); settingsButton.id = 'settings-action'; settingsButton.setAttribute('aria-expanded', 'false');
  const settingsPanel = add(doc, navItems, 'div', 'settings-panel'); settingsPanel.id = 'settings-panel'; settingsPanel.hidden = true; const theme = addButton(doc, settingsPanel, 'button'); theme.id = 'theme-action'; theme.dataset.action = 'theme'; theme.dataset.presentation = 'text'; const themeLabel = doc.createElement('span'); themeLabel.dataset.controlLabel = 'true'; themeLabel.textContent = 'Theme: Light'; theme.appendChild(themeLabel);
  if (!process.env.OMIT_OVERLAY_HOST) {
    add(doc, root, 'div', 'overlay-host');
    const feedback = add(doc, root, 'div', 'feedback-host'); feedback.id = 'feedback-host';
    const documentFeedback = add(doc, feedback, 'div', 'document-feedback');
    const docName = add(doc, documentFeedback, 'span', 'document-name'); docName.id = 'document-name';
    const saveFeedback = add(doc, feedback, 'div', 'save-feedback'); saveFeedback.id = 'save-feedback'; saveFeedback.hidden = true;
    const saveFeedbackText = add(doc, saveFeedback, 'span', 'save-feedback-text'); saveFeedbackText.id = 'save-feedback-text';
    addButton(doc, saveFeedback, 'Retry').id = 'save-feedback-retry';
    addButton(doc, saveFeedback, 'Save As').id = 'save-feedback-save-as';
  }
  if (process.env.FAIL_CREATE_MAP_DIALOG) {
    const overlay = doc.querySelector('#overlay-host');
    overlay.appendChild = function (child) {
      if (child.className === 'create-map-backdrop') throw new Error('dialog-init-failed');
      return FakeElement.prototype.appendChild.call(this, child);
    };
  }
  add(doc, doc.body, 'pre', 'status');
  return { doc, desktopCreate, mobileCreate, desktopSave, desktopOpen, mobileSave, mobileOpen, saveState, mapMenu, mapMenuButton, nav, overlayHost: doc.querySelector('#overlay-host'), graphHost: doc.querySelector('#graph-host') };
}
async function openViaFileChoice(env, label = 'Open Orbit') {
  const trigger = env.doc.querySelector('#open-orbit-action');
  if (!trigger) throw new Error('Open Orbit action is missing');
  await trigger.click();
  const kind = label === 'Open Orbit' ? 'folder' : 'file';
  const choice = findAll(env.doc.body, 'button').find((button) => button.dataset.openKind === kind);
  if (!choice) throw new Error('Open Orbit submenu choice is missing: ' + kind);
  await choice.click();
  if (kind === 'folder') {
    const terminal = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    const specialPicker = globalThis.__M5_ORBIT_PICK__ === 'deny' || globalThis.__M5_ORBIT_PICK__ === 'cancel';
    if (terminal && specialPicker) {
      const choose = findAll(terminal, 'button').find((button) => button.dataset.openBrowser === 'choose-folder');
      if (choose) await choose.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return;
    }
    if (terminal) {
      const cancel = findAll(terminal, 'button').find((button) => button.textContent === 'Cancel');
      if (cancel) await cancel.click();
    }
    await globalThis.__M5_TEST_CONNECT_ORBIT__?.();
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

function syntheticFile(name, type = 'text/plain', text = 'content', relativePath = name) {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, type, webkitRelativePath: relativePath, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }, slice() { return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; } };
}
function makeSyntheticPackage({ rootId, rootName, fileName, bytes, text = '' }) {
  const fileBlob = new Blob([bytes], { type: 'application/octet-stream' });
  const classification = { format: 'file', badge: 'FILE', needsReview: false };
  const registry = createAttachmentRegistry({ datasetToken: 9001 });
  registry.adopt({ attachmentId: rootId + '-att', file: fileBlob, metadata: { attachmentId: rootId + '-att', originalName: fileName, sizeBytes: bytes.length, mime: 'application/octet-stream', classification } });
  const tree = { id: rootId, kind: 'folder', name: rootName, children: [{ id: rootId + '-file', kind: 'file', name: fileName, data: { description: text, link: null, dataType: 'file', attachmentId: rootId + '-att', originalName: fileName, sizeBytes: bytes.length, mime: 'application/octet-stream', classification } }] };
  return encodeBackup({ tree, registry, mapName: rootName }).then((result) => result.blob);
}
function fakeOrbitFile(name, bytes, lastModified = 100) {
  return {
    name, size: bytes.byteLength, lastModified, type: 'application/x-orbit',
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    slice(start = 0, end = bytes.byteLength) { const part = bytes.slice(start, end); return { async arrayBuffer() { return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength); } }; }
  };
}
let fakeOrbitSequence = 0;
function makeFakeOrbitFile(name, initialBytes, { lastModified = 100 } = {}) {
  let current = Uint8Array.from(initialBytes); let stamp = lastModified; let failNextGet = false; const id = ++fakeOrbitSequence;
  const handle = {
    kind: 'file', name, __orbitId: id, createWritableCalls: 0,
    async getFile() { if (failNextGet) { failNextGet = false; throw new Error('post-close baseline read failed'); } return fakeOrbitFile(name, current, stamp); },
    async isSameEntry(other) { return other === handle || (other?.__orbitId != null && other.__orbitId === id); },
    async createWritable() {
      handle.createWritableCalls += 1;
      if (handle.__failWrite === 'createWritable') throw new Error('injected createWritable failure');
      let next = null;
      return {
        async write(value) { if (handle.__failWrite === 'write') throw new Error('injected write failure'); next = value instanceof Uint8Array ? Uint8Array.from(value) : new Uint8Array(await value.arrayBuffer()); },
        async close() { if (handle.__failWrite === 'close') throw new Error('injected close failure'); if (next) current = next; stamp += 1; next = null; if (handle.__failGetAfterWrite) { handle.__failGetAfterWrite = false; failNextGet = true; } },
        async abort() { next = null; }
      };
    },
    replace(nextBytes, nextLastModified = stamp) { current = Uint8Array.from(nextBytes); stamp = Number(nextLastModified) || stamp; },
    get bytes() { return current; }
  };
  return handle;
}
function makeFakeOrbitDirectory(name, entries = []) {
  const map = new Map(entries.map((entry) => [entry.name, entry]));
  const handle = {
    kind: 'directory', name, createDirectoryCalls: 0,
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async isSameEntry(other) { return other === handle; },
    values() { return (async function* () { for (const entry of map.values()) yield [entry.name, entry]; })(); },
    async getFileHandle(childName, options = {}) {
      const existing = map.get(childName);
      if (existing) {
        if (existing.kind !== 'file') { const error = new Error('type mismatch'); error.name = 'TypeMismatchError'; throw error; }
        return existing;
      }
      if (!options.create) { const error = new Error('not found'); error.name = 'NotFoundError'; throw error; }
      if (handle.__createGate) { handle.__createGateStarted?.resolve?.(); await handle.__createGate; }
      const child = makeFakeOrbitFile(childName, new Uint8Array(), { lastModified: 300 });
      if (handle.__failNextCreateWrite) { child.__failWrite = handle.__failNextCreateWrite; handle.__failNextCreateWrite = null; }
      if (handle.__failNextGetAfterWrite) { child.__failGetAfterWrite = true; handle.__failNextGetAfterWrite = false; }
      map.set(childName, child);
      return child;
    },
    async getDirectoryHandle(childName, options = {}) {
      const existing = map.get(childName);
      if (existing) {
        if (existing.kind !== 'directory') { const error = new Error('type mismatch'); error.name = 'TypeMismatchError'; throw error; }
        return existing;
      }
      if (!options.create) { const error = new Error('not found'); error.name = 'NotFoundError'; throw error; }
      handle.createDirectoryCalls += 1;
      if (handle.__createDirectoryGate) { handle.__createDirectoryStarted?.resolve?.(); await handle.__createDirectoryGate; }
      const child = makeFakeOrbitDirectory(childName, []);
      map.set(childName, child);
      return child;
    },
    async removeEntry(childName) { map.delete(childName); },
    get entries() { return [...map.values()]; }
  };
  return handle;
}
async function run() {
  const env = buildDocument();
  globalThis.document = env.doc;
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1100, innerHeight: 473, listeners: new Map(), addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }, dispatch(type) { for (const fn of this.listeners.get(type) || []) fn({ type }); }, matchMedia: (query) => ({ matches: /max-width:\s*560px/.test(query) ? Number(globalThis.window?.innerWidth || 1100) <= 560 : true }), __M5_EXPLORATION_STATUS__: null };
  if (process.env.OPEN_WORKFLOW || process.env.ORBIT_UI || process.env.ORBIT_R1 || process.env.ORBIT_R2 || process.env.ORBIT_CREATE || process.env.ORBIT_ADD || process.env.ORBIT_FAIL || process.env.FILE_OPEN_NAV || process.env.FILE_OPEN_NAV_UNSUPPORTED || process.env.FILE_OPEN_BROWSER_STALE || process.env.ORBIT_MENU || process.env.CREATE_LOCATION || process.env.CREATE_LOCATION_STALE || process.env.COPY_MAP || process.env.COPY_MAP_STALE || process.env.COPY_MAP_ENCODE || process.env.ORBIT_ONLY || process.env.AUTO_CONFLICT) {
    const packageBlob = await makeSyntheticPackage({ rootId: 'orbit-alpha', rootName: 'Orbit Alpha', fileName: 'alpha.txt', bytes: new TextEncoder().encode('alpha-bytes'), text: 'Orbit Alpha' });
    const changedBlob = await makeSyntheticPackage({ rootId: 'orbit-alpha', rootName: 'Orbit Alpha', fileName: 'alpha.txt', bytes: new TextEncoder().encode('alpha-bytez'), text: 'Orbit Alpha' });
    const packageBytes = new Uint8Array(await packageBlob.arrayBuffer());
    const changedBytes = new Uint8Array(await changedBlob.arrayBuffer());
    const mapHandle = makeFakeOrbitFile('alpha.orbit', packageBytes, { lastModified: 200 });
    const invalidHandle = makeFakeOrbitFile('invalid.orbit', new TextEncoder().encode('not a package'), { lastModified: 201 });
    const copyHandle = makeFakeOrbitFile('alpha-copy.orbit', new Uint8Array(), { lastModified: 202 });
    const standaloneBlob = await makeSyntheticPackage({ rootId: 'orbit-beta', rootName: 'Standalone Beta', fileName: 'beta.txt', bytes: new TextEncoder().encode('beta-bytes'), text: 'Standalone Beta' });
    const standaloneBytes = new Uint8Array(await standaloneBlob.arrayBuffer());
    const standaloneHandle = makeFakeOrbitFile('alpha-copy.orbit', standaloneBytes, { lastModified: 205 });
    const legacyBlob = await makeSyntheticPackage({ rootId: 'orbit-legacy', rootName: 'Legacy Orbit', fileName: 'legacy.txt', bytes: new TextEncoder().encode('legacy-bytes'), text: 'Legacy Orbit' });
    const legacyHandle = makeFakeOrbitFile('legacy.orbit', new Uint8Array(await legacyBlob.arrayBuffer()), { lastModified: 206 });
    const directory = makeFakeOrbitDirectory('Orbit Alpha', [mapHandle, invalidHandle, makeFakeOrbitFile('notes.txt', new TextEncoder().encode('note'))]);
    const emptyDirectory = makeFakeOrbitDirectory('Empty Orbit', []);
    globalThis.__M5_ORBIT_FIXTURES__ = { directory, emptyDirectory, mapHandle, invalidHandle, copyHandle, standaloneHandle, legacyHandle, standaloneBytes, packageBytes, changedBytes, packageBlob };
    globalThis.__M5_ORBIT_PICK__ = 'directory';

    if (!process.env.FILE_OPEN_NAV_UNSUPPORTED) globalThis.window.showDirectoryPicker = async () => {
      if (globalThis.__M5_ORBIT_PICK__ === 'cancel') { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
      if (globalThis.__M5_ORBIT_PICK__ === 'deny') { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error; }
      return globalThis.__M5_ORBIT_NEXT_DIRECTORY__ || directory;
    };
    globalThis.window.showOpenFilePicker = async () => [standaloneHandle];
    globalThis.window.showSaveFilePicker = async () => {
      if (globalThis.__M5_ORBIT_SAVE_PICK__ === 'cancel') { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
      return copyHandle;
    };
  }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  if (process.env.P1B || process.env.RECOVERY_SLICE2 || process.env.RECOVERY_STARTUP || process.env.ATTACHMENT_UNAVAILABLE_FEEDBACK || process.env.STAGE3J_ROUTING) { globalThis.indexedDB = new FakeIndexedDB(); globalThis.__M5_P1B_TEST_HOOKS__ = true; }
  if (process.env.P1B_USAGE) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => ({ usage: 123456, quota: 987654 }), persisted: async () => false, persist: async () => true } } });
  if (process.env.P1B_USAGE_UNKNOWN) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = process.env.RECOVERY_SLICE2 || process.env.RECOVERY_IMPORT || process.env.RECOVERY_STARTUP || process.env.TITLE_ONLY || process.env.CREATE_FALLBACK || process.env.CREATE_BASELINE || process.env.CREATE_PICKER_MODE || process.env.CREATE_CLOSE_GATE || process.env.ORBIT_UI || process.env.ORBIT_R1 || process.env.ORBIT_R2 || process.env.ORBIT_CREATE || process.env.ORBIT_ADD || process.env.ORBIT_FAIL || process.env.FILE_OPEN_NAV || process.env.FILE_OPEN_NAV_UNSUPPORTED || process.env.FILE_OPEN_BROWSER_STALE || process.env.ORBIT_MENU || process.env.CREATE_LOCATION || process.env.CREATE_LOCATION_STALE || process.env.COPY_MAP || process.env.COPY_MAP_STALE || process.env.COPY_MAP_ENCODE || process.env.ORBIT_ONLY || process.env.AUTO_CONFLICT ? false : true;
  if (process.env.RECOVERY_STARTUP && !process.env.RECOVERY_EMPTY) {
    if (process.env.RECOVERY_EMPTY) { assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), false); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false); delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return; }
    const seedRepository = createPersistenceRepository({ indexedDB: globalThis.indexedDB, dbName: 'fileorbit' });
    const classification = { format: 'text', badge: 'TXT', needsReview: false };
    const seed = async (name, fileName, bytes, extra = false) => {
      const registry = createAttachmentRegistry({ datasetToken: 1 });
      const file = syntheticFile(fileName, process.env.RECOVERY_PDF ? 'application/pdf' : 'text/plain', new TextDecoder().decode(bytes));
      const staged = registry.stage(file, process.env.RECOVERY_PDF ? { format: 'unknown', badge: '?', needsReview: true } : classification); registry.commit(staged.id);
      const tree = { id: name.replace(/\\s+/g, '-').toLowerCase(), kind: 'folder', name, children: [{ id: name.replace(/\\s+/g, '-').toLowerCase() + '-file', kind: 'file', name: fileName, data: { dataType: 'file', description: null, link: null, attachmentId: staged.id, originalName: fileName, sizeBytes: bytes.length, mime: process.env.RECOVERY_PDF ? 'application/pdf' : 'text/plain', classification: process.env.RECOVERY_PDF ? { format: 'unknown', badge: '?', needsReview: true } : classification } }] };
      if (extra) tree.children.push({ id: tree.id + '-folder', kind: 'folder', name: 'Folder', data: {}, children: [] });
      const snapshot = await buildRecoverySnapshot({ tree, registry, datasetToken: 1, capturedRevision: 1, workspaceId: null, allocateAttachmentId: createAttachmentId });
      const workspace = await seedRepository.createRecoveryWorkspace({ documentName: name, origin: 'edit' });
      await seedRepository.saveRecoveryCheckpoint({ workspaceId: workspace.workspace.workspaceId, workspaceToken: workspace.workspace.workspaceToken, expectedControlVersion: workspace.workspace.controlVersion, documentName: name, origin: 'edit', snapshot });
      return workspace;
    };
    const seededSources = []; seededSources.push(await seed('Recovery Alpha', process.env.RECOVERY_PDF ? 'alpha.pdf' : 'alpha.txt', new TextEncoder().encode(process.env.RECOVERY_PDF ? '%PDF-1.4\nrecovered' : 'alpha-bytes'), false)); globalThis.__RECOVERY_SEEDED_SOURCES__ = seededSources;
    if (process.env.RECOVERY_MULTI) await seed('Recovery Beta', 'beta.txt', new TextEncoder().encode('beta-bytes'), true);
    if (process.env.RECOVERY_CLAIMED) await seedRepository.claimRecoverySource({ workspaceId: seededSources[0].workspace.workspaceId });
    seedRepository.close();
  }
  const module = await import('../../harness/m5-exploration/main.mjs');
  assert.ok(module);
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__);
  if (process.env.OMIT_OVERLAY_HOST || process.env.FAIL_CREATE_MAP_DIALOG) {
    const buttons = env.doc.querySelectorAll('[data-action="create-map"]');
    assert.ok(buttons.length > 0);
    for (const button of buttons) assert.equal(button.dataset.available, 'false');
    assert.match(env.doc.querySelector('#shell-status').textContent, /^Create Map failed to initialize:/);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
  if (process.env.ATTACHMENT_UNAVAILABLE_FEEDBACK) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const fixture = env.doc.querySelector('#fixture'); fixture.value = 'f20'; await fixture.dispatch('change'); await settle(300);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    assert.equal(hooks.openAttachmentByName('Node 12'), true);
    await settle(80);
    assert.match(env.doc.querySelector('#shell-status').textContent, /no longer available|no attachment/i);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.RECOVERY_STARTUP) {
    globalThis.__M5_DISABLE_AUTOMATIC_SAVE__ = true;
    if (process.env.RECOVERY_EMPTY) { assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), false); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false); delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return; }
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await settle(20); } return false; };
    if (process.env.RECOVERY_WORKFLOW) { await env.desktopCreate.click(); await settle(60); assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), false); delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return; }
    assert.equal(await waitFor(() => env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false)), true);
    const backdrop = env.overlayHost.children.find((child) => child.className === 'recovery-backdrop' && child.hidden === false);
    assert.match(textOf(backdrop), /Recover unsaved work/);
    assert.equal(env.doc.activeElement?.textContent, 'Later');
    if (process.env.RECOVERY_CANCEL_RECOVER || process.env.RECOVERY_CANCEL_DISCARD || process.env.RECOVERY_CANCEL_OPEN) {
      hooks.deferAfterRecoveryClaim();
      const actionLabel = process.env.RECOVERY_CANCEL_DISCARD ? 'Discard recovery' : 'Recover work';
      await findAll(backdrop, 'button').find((button) => button.textContent === actionLabel).click();
      assert.equal(await waitFor(() => Boolean(hooks.recoveryOperationState()?.claimId)), true);
      if (process.env.RECOVERY_CANCEL_OPEN) { await openViaFileChoice(env, 'Open map file'); } else if (process.env.RECOVERY_CANCEL_IMPORT) { await env.doc.querySelector('[data-action="upload"]').click(); } else { await env.desktopCreate.click(); }
      await settle(60);
      hooks.releaseAfterRecoveryClaim(); await settle(350);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      if (process.env.RECOVERY_CANCEL_OPEN || process.env.RECOVERY_CANCEL_IMPORT) { assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false); } else { assert.equal(env.overlayHost.children.some((child) => child.className === 'create-map-backdrop' && child.hidden === false), true); }
      const cancelledCandidates = await hooks.recoveryCandidates(); assert.equal(cancelledCandidates.length, 1); assert.equal(cancelledCandidates[0].workspace.claim, null);
      assert.equal(hooks.recoveryOperationState(), null);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    const radios = findAll(backdrop, 'input').filter((input) => input.type === 'radio');
    assert.equal(radios.length, process.env.RECOVERY_MULTI ? 2 : 1);
    if (process.env.RECOVERY_ESCAPE) {
      let prevented = false; for (const fn of env.doc.listeners.get('keydown') || []) fn({ key: 'Escape', preventDefault() { prevented = true; } }); await settle(30);
      assert.equal(prevented, true); assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), false);
      assert.equal((await hooks.recoveryCandidates()).length, 1); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_LATER) {
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Later').click(); await settle(40);
      assert.equal((await hooks.recoveryCandidates()).length, process.env.RECOVERY_MULTI ? 2 : 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_DISCARD_CLAIMED) {
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Discard recovery').click(); await settle(200);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), true);
      assert.equal((await hooks.recoveryCandidates()).length, 1);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_DISCARD_STARTED_CANCEL) {
      hooks.deferRecoveryDiscardStart();
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Discard recovery').click();
      assert.equal(await waitFor(() => hooks.recoveryOperationState()?.destructiveStarted === true), true);
      await env.desktopCreate.click(); await settle(60);
      hooks.releaseRecoveryDiscardStart(); await settle(350);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'create-map-backdrop' && child.hidden === false), true);
      let startedRemaining = 1; const startedEnd = Date.now() + 2000; while (Date.now() < startedEnd) { startedRemaining = (await hooks.recoveryCandidates()).length; if (!startedRemaining) break; await settle(20); } assert.equal(startedRemaining, 0);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_DISCARD) {
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Discard recovery').click();
      if (process.env.RECOVERY_MULTI) { assert.equal(await waitFor(() => (env.overlayHost.children.find((child) => child.className === 'recovery-backdrop')?.hidden === false)), true); } else { assert.equal(await waitFor(() => !env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false)), true); }
      await settle(300);
      assert.equal((await hooks.recoveryCandidates()).length, process.env.RECOVERY_MULTI ? 1 : 0);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_CHILD_CP_FAIL) hooks.failNextRecoveryCheckpoint();
    if (process.env.RECOVERY_CANCEL_AFTER_INSTALL) hooks.deferAfterRecoveryInstall();
    if (process.env.RECOVERY_FAIL_DRAW) hooks.failFrame('recovery-install', 'draw', 1);
    if (process.env.RECOVERY_FAIL_LABEL) hooks.failFrame('recovery-install', 'labels', 1);
    if (process.env.RECOVERY_FAIL_HIT) hooks.failFrame('recovery-install', 'installHit', 1);
    if (process.env.RECOVERY_FAIL_DRAW) hooks.failFrame('recovery-install', 'draw', 1);
    if (process.env.RECOVERY_FAIL_LABEL) hooks.failFrame('recovery-install', 'labels', 1);
    if (process.env.RECOVERY_FAIL_HIT) hooks.failFrame('recovery-install', 'installHit', 1);
    if (process.env.RECOVERY_MULTI) {
      const betaRadio = radios.find((radio) => String(radio.getAttribute('aria-label')).includes('Recovery Beta')); assert.ok(betaRadio); betaRadio.checked = true; await betaRadio.dispatch('change');
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Recover work').click();
    } else {
      await findAll(backdrop, 'button').find((button) => button.textContent === 'Recover work').click();
    }
    if (process.env.RECOVERY_DESTROY) { hooks.destroyMain(); await settle(300); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false); delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return; }
    if (process.env.RECOVERY_CANCEL_AFTER_INSTALL) {
      assert.equal(await waitFor(() => hooks.recoveryOperationState()?.installed === true), true);
      hooks.replaceSession(); hooks.settleSession(); await settle(30);
      const bOwner = await hooks.establishRecoveryForTest(); assert.ok(bOwner);
      const bBefore = await hooks.recoveryState(); const bControlBefore = await hooks.recoveryControl();
      const bStatusBefore = env.doc.querySelector('#shell-status').textContent; const bHandleBefore = hooks.documentState().handle;
      const bTreeBefore = hooks.treeSnapshot(); assert.ok(bTreeBefore);
      const bBytesBefore = await hooks.attachmentBytes('alpha.txt'); assert.ok(bBytesBefore);
      hooks.releaseAfterRecoveryInstall(); await settle(350);
      const bAfter = await hooks.recoveryState(); const bControlAfter = await hooks.recoveryControl();
      assert.equal(hooks.recoveryOperationState(), null);
      assert.equal(bAfter.workspace.workspaceId, bOwner.workspaceId); assert.equal(bAfter.workspace.workspaceToken, bOwner.workspaceToken); assert.equal(bAfter.workspace.controlVersion, bControlBefore.controlVersion);
      assert.equal(bControlAfter.workspaceId, bOwner.workspaceId); assert.equal(bControlAfter.controlVersion, bControlBefore.controlVersion);
      assert.equal(JSON.stringify(bAfter.diagnostics), JSON.stringify(bBefore.diagnostics));
      const bTreeAfter = hooks.treeSnapshot(); assert.ok(bTreeAfter); assert.deepEqual(bTreeAfter, bTreeBefore);
      assert.equal(hooks.documentState().handle, bHandleBefore); assert.equal(hooks.snapshot().dirty, true);
      assert.equal(env.doc.querySelector('#shell-status').textContent, bStatusBefore);
      hooks.openFolderMenu(); await settle(20);
      const bMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(bMenu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
      const bForm = env.doc.querySelector('#editor-form'); const bInput = findAll(bForm, 'input').find((input) => input.type === 'text'); bInput.value = 'B-Edit'; await bInput.dispatch('input');
      await bForm.dispatch('submit', { preventDefault() {} }); await settle(180); await hooks.flushRecovery();
      const bCp = await hooks.recoveryCheckpoint(); assert.ok(bCp.checkpoint); assert.equal(bCp.workspace.workspaceId, bOwner.workspaceId);
      assert.match(JSON.stringify(bCp.checkpoint.tree), /B-Edit/); assert.deepEqual((await hooks.attachmentBytes('alpha.txt')), bBytesBefore);
      assert.equal(bCp.attachments.find((entry) => entry.name === 'alpha.txt').bytes.join(','), bBytesBefore.join(','));
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.RECOVERY_FAIL_DRAW || process.env.RECOVERY_FAIL_LABEL || process.env.RECOVERY_FAIL_HIT) {
      await settle(300);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      const failedCandidates = await hooks.recoveryCandidates(); assert.equal(failedCandidates.length, 1); assert.equal(failedCandidates[0].workspace.claim, null);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'recovery-backdrop' && child.hidden === false), true);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    assert.equal(await waitFor(() => globalThis.window.__M5_EXPLORATION_STATUS__.hasMap === true), true);
    if (process.env.RECOVERY_CHILD_CP_FAIL) {
      await settle(150); await hooks.flushRecovery();
      const failedCp = await hooks.recoveryCheckpoint(); assert.equal(failedCp.checkpoint, null); const childFailCandidates = await hooks.recoveryCandidates(); assert.equal(childFailCandidates.length, 1); assert.equal(childFailCandidates[0].workspace.claim, null);
      assert.equal((await hooks.recoveryCandidates()).length, 1);
      assert.equal(hooks.documentState().active, false); assert.equal(hooks.snapshot().dirty, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /durability could not be secured/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    await settle(150); await hooks.flushRecovery();
    const expectedName = process.env.RECOVERY_MULTI ? 'Recovery Beta' : 'Recovery Alpha';
    const cp = await hooks.recoveryCheckpoint();
    assert.ok(cp.checkpoint); assert.equal(cp.checkpoint.tree.name, expectedName);
    assert.equal(cp.attachments[0].name, process.env.RECOVERY_PDF ? 'alpha.pdf' : (process.env.RECOVERY_MULTI ? 'beta.txt' : 'alpha.txt'));
    assert.deepEqual(cp.attachments[0].bytes, Array.from(new TextEncoder().encode(process.env.RECOVERY_PDF ? '%PDF-1.4\nrecovered' : (process.env.RECOVERY_MULTI ? 'beta-bytes' : 'alpha-bytes'))));
    assert.equal(hooks.documentState().active, false); assert.equal(hooks.documentState().handle, null); assert.equal(hooks.snapshot().dirty, true);
    const control = await hooks.recoveryControl(); assert.ok(control.forkedFrom); assert.notEqual(control.workspaceId, control.forkedFrom.workspaceId);
    const sourceRecord = await hooks.recoveryWorkspaceRecord(control.forkedFrom.workspaceId); assert.equal(sourceRecord.state, 'superseded'); assert.equal(sourceRecord.claim, null); assert.equal(sourceRecord.supersededBy.workspaceId, control.workspaceId);
    if (process.env.RECOVERY_PDF) {
      assert.equal(hooks.openAttachmentByName('alpha.pdf'), true); await settle(60);
      const pdfViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
      assert.ok(pdfViewer); await findAll(pdfViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    const remainingCandidates = await hooks.recoveryCandidates(); assert.equal(remainingCandidates.length, process.env.RECOVERY_MULTI ? 2 : 1); assert.ok(remainingCandidates.some((candidate) => candidate.workspace.workspaceId === control.workspaceId));
    const childWorkspaceId = control.workspaceId;
    const targetFile = process.env.RECOVERY_MULTI ? 'beta.txt' : 'alpha.txt';
    hooks.openNodeMenu(targetFile); await settle(20);
    const fileMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
    await findAll(fileMenu, 'button').find((button) => button.textContent === 'Delete Data').click(); await settle(20);
    const confirmDelete = env.overlayHost.children.find((child) => child.className === 'delete-confirm-backdrop');
    assert.ok(confirmDelete); await findAll(confirmDelete, 'button').find((button) => button.textContent === 'Delete').click(); await settle(80); await hooks.flushRecovery();
    const childCp = await hooks.recoveryCheckpoint(); assert.ok(childCp.checkpoint); assert.equal(childCp.workspace.workspaceId, childWorkspaceId);
    assert.doesNotMatch(JSON.stringify(childCp.checkpoint.tree), new RegExp(targetFile.replace('.', '\\\\.')));
    const saveHandle = { name: 'recovered.orbit', async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } };
    globalThis.window.showOpenFilePicker = async () => [saveHandle]; globalThis.window.showSaveFilePicker = async () => saveHandle;
    await env.doc.querySelector('[data-action="save-map"]').click(); await settle(250); await hooks.flushRecovery();
    assert.equal(hooks.documentState().active, true); assert.notEqual(hooks.documentState().savedRevision, null);
    const postSaveUndo = hooks.historyTest('undo'); assert.equal(postSaveUndo.ok, true); await settle(60); await hooks.flushRecovery();
    const fallbackStart = await hooks.recoveryCheckpoint(); assert.ok(fallbackStart.checkpoint);
    const savedRevisionBeforeFallback = hooks.documentState().savedRevision;
    delete globalThis.window.showSaveFilePicker;
    await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(250); await hooks.flushRecovery();
    assert.equal(hooks.documentState().savedRevision, savedRevisionBeforeFallback);
    assert.equal(hooks.snapshot().dirty, true);
    const fallbackCp = await hooks.recoveryCheckpoint(); assert.ok(fallbackCp.checkpoint);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.P1B_UNAVAILABLE) {
    await env.desktopOpen.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const library = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    assert.ok(library); assert.match(textOf(library), /could not be loaded/);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
    await findAll(library, 'button').find((button) => button.textContent === 'Close').click();
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.RECOVERY_IMPORT) {
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const pkg = await makeSyntheticPackage({ rootId: 'import-root', rootName: 'Imported Recovery', fileName: 'import.txt', bytes: new TextEncoder().encode('imported'), text: 'imported' });
    const imported = await hooks.importPackage(pkg);
    assert.ok(imported?.ok, 'import did not commit');
    await new Promise((resolve) => setTimeout(resolve, 250)); await hooks.flushRecovery();
    assert.ok(hooks.recoveryState().workspace);
    const cp = await hooks.recoveryCheckpoint();
    assert.ok(cp.checkpoint, 'import baseline checkpoint missing');
    assert.match(JSON.stringify(cp.checkpoint.tree), /Imported Recovery/);
    assert.equal(cp.attachments[0].name, 'import.txt');
    assert.deepEqual(cp.attachments[0].bytes, Array.from(new TextEncoder().encode('imported')));
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.RECOVERY_SLICE2) {
    globalThis.__M5_DISABLE_AUTOMATIC_SAVE__ = true;
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const checkpointText = async () => { const cp = await hooks.recoveryCheckpoint(); return cp?.checkpoint ? JSON.stringify(cp.checkpoint.tree) : ''; };
    let pickerGate = null; let closeGate = null; let closeFailure = false; let writeCount = 0; const saveHandle = { name: 'recovery.orbit', async createWritable() { return { async write() { writeCount += 1; }, async close() { if (closeGate) await closeGate; if (closeFailure) throw new Error('injected close failure'); }, async abort() {} }; } }; globalThis.window.showOpenFilePicker = async () => [saveHandle]; globalThis.window.showSaveFilePicker = async () => { if (pickerGate) await pickerGate; return saveHandle; };
    const flush = async () => { await hooks.flushRecovery(); await settle(10); };
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop');
    assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Recovery Map';
    const createFolderInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && input.hasAttribute('webkitdirectory'));
    const selectedFile = syntheticFile('note.txt', 'text/plain', 'hello'); selectedFile.webkitRelativePath = 'note.txt'; createFolderInput.files = [selectedFile]; await createFolderInput.dispatch('change'); await settle(20);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(200);
    assert.ok(hooks.recoveryState().workspace);
    let cp = await hooks.recoveryCheckpoint(); assert.equal(cp.checkpoint, null); assert.equal(hooks.snapshot().dirty, false); hooks.scheduleRecoveryTest(); await flush();
    cp = await hooks.recoveryCheckpoint();
    assert.equal(cp.checkpoint.capturedRevision, 0);
    assert.equal(cp.attachments[0].name, 'note.txt');
    assert.deepEqual(cp.attachments[0].bytes, Array.from(new TextEncoder().encode('hello')));
    assert.equal(cp.checkpoint.attachmentBytes, 5);
    hooks.setRecoveryDebounce(5);

    const baselineGeneration = cp.checkpoint.checkpointGeneration;
    hooks.openDraft(); await settle(20);
    const draftForm = env.doc.querySelector('#editor-form');
    const draftInput = findAll(draftForm, 'input').find((input) => input.type === 'text'); draftInput.value = 'draft-only'; await draftInput.dispatch('input');
    env.doc.querySelector('#fit')?.click(); await settle(20);
    await flush();
    cp = await hooks.recoveryCheckpoint();
    assert.equal(cp.checkpoint.checkpointGeneration, baselineGeneration);
    await findAll(draftForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);

    hooks.openFolderMenu(); await settle(20);
    let menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
    await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
    let form = env.doc.querySelector('#editor-form');
    let folderInput = findAll(form, 'input').find((input) => input.type === 'text'); folderInput.value = 'Folder'; await folderInput.dispatch('input');
    await form.dispatch('submit', { preventDefault() {} }); await settle(200); await flush();
    const folder = hooks.findNode('Folder'); assert.ok(folder);

    hooks.openAddData(); await settle(20);
    form = env.doc.querySelector('#editor-form');
    const addName = findAll(form, 'input').find((input) => input.type === 'text'); addName.value = 'created.pdf'; await addName.dispatch('input');
    const addDesc = findAll(form, 'textarea')[0]; if (addDesc) { addDesc.value = 'Created'; await addDesc.dispatch('input'); }
    const addType = findAll(form, 'select')[0]; addType.value = 'file'; await addType.dispatch('change'); await settle(20);
    const addFile = findAll(form, 'input').find((input) => input.type === 'file'); addFile.files = [syntheticFile('created.pdf', 'application/pdf', '%PDF created')]; await addFile.dispatch('change'); await settle(40);
    closeFailure = true;
    await form.dispatch('submit', { preventDefault() {} }); await settle(200); await flush();
    cp = await hooks.recoveryCheckpoint();
    const pdf = cp.attachments.find((entry) => entry.name === 'created.pdf');
    assert.ok(pdf); assert.deepEqual(pdf.bytes, Array.from(new TextEncoder().encode('%PDF created')));
    closeFailure = false; await form.dispatch('submit', { preventDefault() {} }); await settle(200); await flush();

    const note = hooks.findNode('note.txt'); hooks.reparentTest(note.id, folder.id); await settle(20); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.match(JSON.stringify(cp.checkpoint.tree), /"Folder"[\s\S]*"note.txt"/);

    hooks.openNodeMenu('created.pdf'); await settle(20);
    menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
    await findAll(menu, 'button').find((button) => button.textContent === 'Delete Data').click(); await settle(20);
    const confirm = env.overlayHost.children.find((child) => child.className === 'delete-confirm-backdrop');
    assert.ok(confirm); await findAll(confirm, 'button').find((button) => button.textContent === 'Delete').click(); await settle(30); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.doesNotMatch(JSON.stringify(cp.checkpoint.tree), /created\.pdf/);
    const undoResult = hooks.historyTest('undo'); assert.equal(undoResult.ok, true); await settle(30); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.match(JSON.stringify(cp.checkpoint.tree), /created\.pdf/);
    const redoResult = hooks.historyTest('redo'); assert.equal(redoResult.ok, true); await settle(30); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.doesNotMatch(JSON.stringify(cp.checkpoint.tree), /created\.pdf/);

    const workspaceBeforeSaveAs = hooks.recoveryState().workspace.workspaceId;
    assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
    await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(300);
    assert.equal(env.saveState.textContent, 'Saved');
    cp = await hooks.recoveryCheckpoint(); assert.equal(cp.checkpoint, null);
    await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(200);
    assert.equal(hooks.recoveryState().workspace.workspaceId, workspaceBeforeSaveAs);
    const fallbackUndo = hooks.historyTest('undo'); assert.equal(fallbackUndo.ok, true); await settle(30); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.ok(cp.checkpoint, 'fallback setup checkpoint missing');
    const revisionBeforeFallback = hooks.snapshot().dataRevision; const historyBeforeFallback = hooks.historyState().undo;
    delete globalThis.window.showSaveFilePicker;
    await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(200); await flush();
    assert.equal(hooks.snapshot().dataRevision, revisionBeforeFallback);
    assert.equal(hooks.historyState().undo, historyBeforeFallback);
    cp = await hooks.recoveryCheckpoint(); assert.ok(cp.checkpoint, 'fallback handoff lost recovery data');
    let releaseLaterClose; closeGate = new Promise((resolve) => { releaseLaterClose = resolve; });
    const laterSave = env.desktopSave.click(); await settle(40);
    const laterEdit = hooks.historyTest('redo'); assert.equal(laterEdit.ok, true); await settle(20); await flush();
    releaseLaterClose(); closeGate = null; await laterSave; await settle(200); await flush();
    cp = await hooks.recoveryCheckpoint(); assert.ok(cp.checkpoint, 'later edit did not survive Save');
    assert.ok(cp.checkpoint.capturedRevision > hooks.documentState().savedRevision);
    assert.equal(hooks.snapshot().dirty, true);
    hooks.deferNextRecoveryRetirement();
    const documentBeforeRetirement = hooks.documentState();
    const staleSave = env.desktopSave.click(); await settle(100);
    hooks.replaceSession(); hooks.settleSession();
    const documentAfterReplacement = hooks.documentState();
    hooks.releaseRecoveryRetirement();
    await staleSave; await settle(200); await flush();
    assert.deepEqual(hooks.documentState(), documentAfterReplacement);
    assert.notEqual(env.doc.querySelector('#save-state').textContent, 'Saved');
    assert.equal(hooks.documentState().active, documentBeforeRetirement.active);
    assert.equal(hooks.documentState().name, documentBeforeRetirement.name);

    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.MENU_RESIZE) {
    const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
    const docEl = env.doc.documentElement; docEl._clientWidth = 640; docEl._clientHeight = 600;
    const mapButton = env.doc.querySelector('#map-menu-button'); const mapMenu = env.doc.querySelector('#map-menu'); const moreButton = env.doc.querySelector('#more-menu-button'); const moreMenu = env.doc.querySelector('#more-menu');
    mapButton.style.left = '472px'; mapButton.style.top = '24px'; await mapButton.click(); await settle();
    assert.equal(mapMenu.hidden, false); assert.equal(mapMenu.style.maxHeight, '584px'); assert.equal(mapMenu.style.left, '472px');
    const mapItem = findAll(mapMenu, 'button')[0]; assert.equal(env.doc.activeElement, mapItem); mapMenu.scrollTop = 30;
    docEl._clientWidth = 320; docEl._clientHeight = 240; globalThis.window.dispatch('resize'); await settle();
    assert.equal(mapMenu.style.maxHeight, '224px'); assert.ok(Number.parseFloat(mapMenu.style.left) <= 272); assert.ok(Number.parseFloat(mapMenu.style.top) + 16 <= 240); assert.equal(env.doc.activeElement, mapItem); assert.equal(mapMenu.scrollTop, 30); assert.equal(mapMenu.hidden, false);
    mapButton.hidden = true; globalThis.window.dispatch('resize'); await settle(); assert.equal(mapMenu.hidden, true); mapButton.hidden = false;
    moreButton.style.left = '600px'; moreButton.style.top = '24px'; await moreButton.click(); await settle(); assert.equal(moreMenu.hidden, false); assert.ok(Number.parseFloat(moreMenu.style.left) <= 272);
    docEl._clientWidth = 800; docEl._clientHeight = 700; for (const fn of env.doc.listeners.get('fullscreenchange') || []) fn({ type: 'fullscreenchange' }); await settle(); assert.equal(moreMenu.style.maxHeight, '684px'); assert.ok(Number.parseFloat(moreMenu.style.left) <= 752);
    await moreButton.click(); await settle(); assert.equal(moreMenu.hidden, true);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.LAYOUT_EMPTY) {
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const status = globalThis.window.__M5_EXPLORATION_STATUS__; assert.equal(status.hasMap, false);
    const appRoot = env.doc.querySelector('#app-root'); const layout = env.doc.querySelector('#layout'); const error = env.doc.querySelector('#error'); const graphViewport = env.doc.querySelector('#graph-viewport'); const empty = env.doc.querySelector('#empty-state');
    assert.equal(layout.parent, appRoot); assert.equal(error.parent, appRoot); assert.equal(appRoot.children.indexOf(env.doc.querySelector('#app-header')), 0); assert.equal(appRoot.children.indexOf(error), 1); assert.equal(appRoot.children.indexOf(layout), 2);
    assert.match(findAll(empty, 'h2')[0].textContent, /Create a map to get started/); assert.match(findAll(empty, 'button').map((button) => button.textContent).join(' '), /Create Map/);
    error.textContent = 'Temporary startup error'; assert.equal(layout.parent, appRoot); error.textContent = ''; assert.equal(layout.parent, appRoot);
    await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(backdrop); assert.equal(backdrop.hidden, false); await findAll(backdrop, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20); assert.equal(backdrop.hidden, true);
    globalThis.window.innerWidth = 320; globalThis.window.dispatch('resize'); await settle(30); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true'); assert.equal(env.doc.querySelector('#details-toggle-label').textContent, 'Details'); assert.ok(env.doc.querySelector('#details-toggle-icon')); assert.equal(layout.parent, appRoot); assert.ok(graphViewport._clientHeight > 0);
    const mapButton = env.doc.querySelector('#map-menu-button'); const mapMenu = env.doc.querySelector('#map-menu'); await mapButton.click(); await settle(20); assert.equal(mapMenu.hidden, false); assert.ok(findAll(mapMenu, 'button').length >= 4); assert.ok(findAll(mapMenu, 'button').some((button) => button.textContent === 'Create Map')); assert.ok(findAll(mapMenu, 'button').some((button) => button.textContent === 'Upload')); await mapButton.click(); await settle(20); const moreButton = env.doc.querySelector('#more-menu-button'); const moreMenu = env.doc.querySelector('#more-menu'); await moreButton.click(); await settle(20); assert.equal(moreMenu.hidden, false); assert.ok(findAll(moreMenu, 'button').some((button) => button.textContent === 'Theme: Light')); await moreButton.click(); await settle(20); await env.doc.querySelector('#details-toggle').click(); await settle(20); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false'); assert.equal(env.doc.querySelector('#details-toggle-label').textContent, 'Hide details'); await env.doc.querySelector('#details-toggle').click(); await settle(20); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true'); assert.equal(env.doc.querySelector('#details-toggle-label').textContent, 'Details');
    globalThis.window.navigator = { maxTouchPoints: 5 };
    await env.doc.querySelector('#details-toggle').click(); await settle(30);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false');
    globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390; globalThis.window.dispatch('resize'); await settle(60);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true', 'entering phone landscape collapses Details');
    assert.equal(env.doc.querySelector('#details-content').hidden, true);
    assert.equal(env.doc.querySelector('#details-toggle').getAttribute('aria-expanded'), 'false');
    await env.doc.querySelector('#details-toggle').click(); await settle(30);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false', 'landscape Details can be reopened');
    globalThis.window.innerWidth = 820; globalThis.window.dispatch('resize'); await settle(60);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false', 'ordinary landscape resize does not recollapse Details');
    globalThis.window.innerWidth = 390; globalThis.window.innerHeight = 844; globalThis.window.dispatch('resize'); await settle(60);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true', 'portrait transition keeps Details collapsed');
    globalThis.window.innerWidth = 844; globalThis.window.innerHeight = 390; globalThis.window.dispatch('resize'); await settle(60);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true', 're-entering landscape collapses Details again');
    delete globalThis.window.navigator; globalThis.window.innerWidth = 1100; globalThis.window.innerHeight = 473; globalThis.window.dispatch('resize'); await settle(60);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false', 'desktop is not forced collapsed');
    const fullscreenButton = env.doc.querySelector('#fullscreen-action'); const fullscreenGlyph = env.doc.querySelector('#fullscreen-glyph'); assert.ok(fullscreenGlyph, 'production fullscreen glyph is present'); assert.equal(fullscreenGlyph.getAttribute('d'), 'M7 3H3v4m10-4h4v4M7 17H3v-4m10 4h4v-4');
    await fullscreenButton.click(); await settle(20); assert.equal(fullscreenButton.getAttribute('aria-label'), 'Exit fullscreen'); assert.equal(fullscreenButton.getAttribute('data-tooltip'), 'Exit fullscreen'); assert.equal(fullscreenGlyph.getAttribute('d'), 'M3 7h4V3m10 4h-4V3M3 13h4v4m10-4h-4v4');
    await fullscreenButton.click(); await settle(20); assert.equal(fullscreenButton.getAttribute('aria-label'), 'Enter fullscreen'); assert.equal(fullscreenButton.getAttribute('data-tooltip'), 'Enter fullscreen'); assert.equal(fullscreenGlyph.getAttribute('d'), 'M7 3H3v4m10-4h4v4M7 17H3v-4m10 4h4v-4');
    await env.desktopCreate.click(); const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const dialog = createBackdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Layout Map'; const fileInput = findAll(dialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'layout')]; await fileInput.dispatch('change'); await settle(20); await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, true); assert.equal(error.textContent, ''); assert.equal(layout.parent, appRoot); assert.ok(graphViewport._clientHeight > 0);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.AUTO_NO_DEST) {
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const hooks = globalThis.window.__M5_P1B_TEST__; const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    let downloads = 0; const realCreate = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { downloads += 1; return realCreate(blob); };
    await env.desktopCreate.click(); const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'No Dest';
    const createFolderInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && input.hasAttribute('webkitdirectory'));
    const selectedFile = syntheticFile('note.txt', 'text/plain', 'hello'); selectedFile.webkitRelativePath = 'note.txt'; createFolderInput.files = [selectedFile]; await createFolderInput.dispatch('change'); await settle(20);
    hooks.openFolderMenu(); await settle(20); const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
    const form = env.doc.querySelector('#editor-form'); const folderInput = findAll(form, 'input').find((input) => input.type === 'text'); folderInput.value = 'Target'; await folderInput.dispatch('input'); await form.dispatch('submit', { preventDefault() {} }); await settle(300);
    const closeForm = findAll(form, 'button').find((button) => button.textContent === 'Close'); if (form.hidden === false && closeForm) { await closeForm.click(); await settle(80); }
    const baseDownloads = downloads;
    const note = hooks.findNode('note.txt'); const folder = hooks.findNode('Target'); assert.ok(note && folder);
    hooks.reparentTest(note.id, folder.id); await settle(300);
    assert.equal(downloads, baseDownloads, 'automatic save does not download');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false);
    assert.match(env.doc.querySelector('#save-feedback-text').textContent, /Save As/i);
    assert.equal(env.doc.querySelector('#save-feedback-retry').hidden, true);
    assert.equal(hooks.snapshot().dirty, true);
    await env.doc.querySelector('#save-feedback-save-as').click(); await settle(250);
    assert.equal(downloads, baseDownloads + 1, 'explicit Save As/download starts one handoff');
    assert.equal(hooks.snapshot().dirty, true, 'download handoff stays unconfirmed dirty');
    await settle(150); assert.equal(downloads, baseDownloads + 1, 'no repeated unsolicited downloads');
    URL.createObjectURL = realCreate;
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.SIDEBAR_TOOLTIPS) {
    const watch = setTimeout(() => { writeLifecycleMarker('SIDEBAR_TOOLTIPS_WATCHDOG'); console.error('SIDEBAR_TOOLTIPS_WATCHDOG'); process.exit(70); }, 15000); watch.unref?.();
    const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
    const nav = env.doc.querySelector('#nav-rail'); const railToggle = env.doc.querySelector('#nav-rail-toggle');
    const createButton = findAll(nav, 'button').find((button) => button.dataset.action === 'create-map');
    const graphButton = env.doc.querySelector('#search-toggle');
    const navTip = env.doc.querySelector('#nav-rail-tooltip'); const graphTip = env.doc.querySelector('#graph-action-tooltip');
    navTip.hidden = true; graphTip.hidden = true;
    createButton.setAttribute('aria-label', 'Create Map'); createButton.setAttribute('title', 'Create Map');
    graphButton.setAttribute('aria-label', 'Search'); graphButton.setAttribute('title', 'Search');
    assert.equal(nav.dataset.expanded, 'false');
    await createButton.dispatch('pointerenter');
    assert.equal(navTip.hidden, false, 'collapsed hover shows custom tooltip'); assert.equal(navTip.textContent, 'Create Map');
    await createButton.dispatch('focus'); assert.equal(navTip.hidden, false, 'collapsed focus shows custom tooltip');
    await railToggle.click(); await settle(30);
    assert.equal(nav.dataset.expanded, 'true');
    assert.equal(navTip.hidden, true, 'expanded rail dismisses custom tooltip immediately');
    assert.equal(createButton.getAttribute('title'), null, 'expanded rail suppresses native title');
    assert.equal(createButton.getAttribute('aria-label'), 'Create Map', 'accessible name remains');
    assert.equal(createButton.getAttribute('aria-description'), 'Create Map', 'disabled/action explanation remains available');
    await createButton.dispatch('pointerenter'); await createButton.dispatch('focus'); assert.equal(navTip.hidden, true, 'expanded rail suppresses hover and focus tooltips');
    await graphButton.dispatch('pointerenter'); assert.equal(graphTip.hidden, false, 'graph toolbar tooltip remains enabled'); assert.equal(graphTip.textContent, 'Search');
    graphTip.hidden = true;
    await railToggle.click(); await settle(30);
    assert.equal(nav.dataset.expanded, 'false');
    assert.equal(createButton.getAttribute('title'), 'Create Map', 'collapsed rail restores native title');
    await createButton.dispatch('pointerenter'); assert.equal(navTip.hidden, false, 'collapsed rail restores custom tooltip');
    clearTimeout(watch); writeLifecycleMarker('SIDEBAR_TOOLTIPS_COMPLETE'); console.log('SIDEBAR_TOOLTIPS_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.DRAG_HISTORY) {
    const r1Watchdog = setTimeout(() => { writeLifecycleMarker('AUTO_EDITOR_R1_WATCHDOG'); console.error('AUTO_EDITOR_R1_WATCHDOG'); process.exit(70); }, 20000); r1Watchdog.unref?.();
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const autoWrites = []; let activeWriters = 0; let maxWriters = 0; let rapidGate = null; let failNextWrite = false;
    const autoHandle = { name: 'drag.orbit', async getFile() { const bytes = autoWrites.at(-1) || new TextEncoder().encode('not-saved'); return { name: 'drag.orbit', size: bytes.byteLength, type: 'application/x-orbit', async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }, slice(start = 0, end = bytes.byteLength) { return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + end) }; } }; }, async createWritable() { activeWriters += 1; maxWriters = Math.max(maxWriters, activeWriters); const chunks = []; let closed = false; return { async write(blob) { if (failNextWrite) { failNextWrite = false; throw new Error('injected auto write failure'); } chunks.push(blob); }, async close() { if (!closed) { if (rapidGate) await rapidGate; closed = true; autoWrites.push(new Uint8Array(await new Blob(chunks).arrayBuffer())); activeWriters -= 1; } }, async abort() { if (!closed) { closed = true; activeWriters -= 1; } } }; } };
    globalThis.window.showSaveFilePicker = async () => autoHandle;
    globalThis.window.showOpenFilePicker = async () => [];
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Drag Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'drag-bytes')]; await fileInput.dispatch('change'); await settle(20);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    hooks.openFolderMenu(); await settle(20); let menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
    const form = env.doc.querySelector('#editor-form'); const folderInput = findAll(form, 'input').find((input) => input.type === 'text'); folderInput.value = 'Target'; await folderInput.dispatch('input'); await form.dispatch('submit', { preventDefault() {} }); await settle(200);
    await env.doc.querySelector('#nav-rail-toggle').click(); await settle(40); await env.doc.querySelector('#nav-rail-toggle').click(); await settle(40);
    const note = hooks.nodeSceneCenter('note.txt'); const target = hooks.nodeSceneCenter('Target'); assert.ok(note && target); const writesBeforeReparent = autoWrites.length;
    const canvas = env.graphHost.children.find((child) => child.tagName === 'CANVAS'); assert.ok(canvas); hooks.setCanvasRect({ left: 0, top: 0, right: 1100, bottom: 431, width: 1100, height: 431 });
    const pe = (type, x, y) => canvas.dispatch(type, { button: 0, pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: x, clientY: y });
    const bytesBefore = await hooks.attachmentBytes('note.txt'); assert.ok(bytesBefore); const historyBefore = hooks.historyState().undo; const noteIdBefore = hooks.findNode('note.txt').id; const treeBefore = hooks.treeSnapshot(); const childIndex = (root, id) => (root?.children || []).findIndex((child) => child.id === id); const originalIndex = childIndex(treeBefore, noteIdBefore);
    await pe('pointerdown', note.center.x, note.center.y); await pe('pointermove', note.center.x + 18, note.center.y + 12); await pe('pointermove', target.center.x, target.center.y); await pe('pointerup', target.center.x, target.center.y); await settle(250);
    const treeAfter = hooks.treeSnapshot(); const parentOf = (root, id, parent = null) => { if (!root) return null; if (root.id === id) return parent; for (const child of root.children || []) { const found = parentOf(child, id, root); if (found) return found; } return null; };
    assert.equal(hooks.historyState().undo, historyBefore + 1); assert.equal(hooks.historyState().redo, 0); assert.equal(env.doc.querySelector('#undo-history').disabled, false);
    assert.equal(parentOf(treeAfter, hooks.findNode('note.txt').id)?.name, 'Target');
    const reparentSaved = await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length >= writesBeforeReparent + 1) return true; await settle(20); } return false; })();
    assert.equal(reparentSaved, true, 'reparent autosaves once');
    assert.equal(autoWrites.length, writesBeforeReparent + 1, 'exactly one successful reparent autosave');
    const afterReparent = await hooks.decodeDocument(new Blob([autoWrites.at(-1)])); const parentEntry = (root, id) => { if (!root) return null; if ((root.children || []).some((child) => child.id === id)) return root; for (const child of root.children || []) { const found = parentEntry(child, id); if (found) return found; } return null; };
    assert.equal(parentEntry(afterReparent.tree, noteIdBefore)?.name, 'Target');
    assert.deepEqual(afterReparent.attachments.find((entry) => entry.name === 'note.txt')?.bytes, Array.from(bytesBefore));
    const writesAfterReparent = autoWrites.length;
    await env.doc.querySelector('#undo-history').click(); await settle(150);
    assert.equal(hooks.historyState().undo, historyBefore); assert.equal(hooks.historyState().redo, 1); assert.equal(parentOf(hooks.treeSnapshot(), hooks.findNode('note.txt').id)?.name, 'Drag Map'); assert.equal(childIndex(hooks.treeSnapshot(), noteIdBefore), originalIndex);
    assert.deepEqual(await hooks.attachmentBytes('note.txt'), bytesBefore);
    assert.equal(await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length > writesAfterReparent) return true; await settle(20); } return false; })(), true, 'undo autosaves');
    assert.equal(autoWrites.length, writesAfterReparent + 1, 'exactly one successful undo autosave');
    const afterUndo = await hooks.decodeDocument(new Blob([autoWrites.at(-1)])); assert.equal(parentEntry(afterUndo.tree, noteIdBefore)?.name, 'Drag Map', 'undo saved root parent');
    await env.doc.querySelector('#redo-history').click(); await settle(150);
    assert.equal(hooks.historyState().undo, historyBefore + 1); assert.equal(hooks.historyState().redo, 0); assert.equal(parentOf(hooks.treeSnapshot(), hooks.findNode('note.txt').id)?.name, 'Target'); assert.equal(hooks.findNode('note.txt').id, noteIdBefore); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, true); assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.viewport.height > 0); assert.equal(childIndex(hooks.treeSnapshot().children.find((child) => child.name === 'Target'), noteIdBefore), 0);
    assert.equal(await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length > writesAfterReparent + 1) return true; await settle(20); } return false; })(), true, 'redo autosaves');
    assert.equal(autoWrites.length, writesAfterReparent + 2, 'exactly one successful redo autosave');
    const afterRedo = await hooks.decodeDocument(new Blob([autoWrites.at(-1)])); assert.equal(parentEntry(afterRedo.tree, noteIdBefore)?.name, 'Target', 'redo saved Target parent');
    let releaseRapid; rapidGate = new Promise((resolve) => { releaseRapid = resolve; }); const beforeRapid = autoWrites.length;
    await env.doc.querySelector('#undo-history').click(); await settle(60);
    await env.doc.querySelector('#redo-history').click(); await settle(60);
    releaseRapid(); rapidGate = null;
    assert.equal(await (async () => { for (let i = 0; i < 200; i += 1) { if (autoWrites.length >= beforeRapid + 2) return true; await settle(20); } return false; })(), true, 'rapid mutations coalesce to a later save');
    const afterRapid = await hooks.decodeDocument(new Blob([autoWrites.at(-1)])); assert.equal(parentEntry(afterRapid.tree, noteIdBefore)?.name, 'Target'); assert.equal(maxWriters, 1);
    const noteFinal = hooks.nodeSceneCenter('note.txt'); assert.ok(noteFinal); await pe('pointerdown', noteFinal.center.x, noteFinal.center.y); await pe('pointermove', noteFinal.center.x + 18, noteFinal.center.y + 12); await pe('pointerup', noteFinal.center.x, noteFinal.center.y); await settle(120);
    const writesBeforeRejected = autoWrites.length;
    assert.equal(hooks.historyState().undo, historyBefore + 1); assert.equal(env.doc.querySelector('#undo-history').disabled, false); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.drag, null);
    await settle(120); assert.equal(autoWrites.length, writesBeforeRejected, 'rejected/self drop does not autosave');
    await pe('pointerdown', 5, 5); await pe('pointermove', 45, 35); await pe('pointerup', 45, 35); await settle(120); assert.equal(autoWrites.length, writesBeforeRejected, 'background camera pan does not autosave');
    globalThis.window.innerWidth = 320; globalThis.window.dispatch('resize'); await settle(120); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true'); assert.equal(env.doc.querySelector('#undo-history').disabled, false); await env.doc.querySelector('#undo-history').click(); await settle(180); assert.equal(parentOf(hooks.treeSnapshot(), hooks.findNode('note.txt').id)?.name, 'Drag Map'); assert.equal(childIndex(hooks.treeSnapshot(), noteIdBefore), originalIndex); assert.equal(env.doc.querySelector('#redo-history').disabled, false); await env.doc.querySelector('#redo-history').click(); await settle(180); assert.equal(parentOf(hooks.treeSnapshot(), hooks.findNode('note.txt').id)?.name, 'Target'); assert.equal(childIndex(hooks.treeSnapshot().children.find((child) => child.name === 'Target'), noteIdBefore), 0); globalThis.window.innerWidth = 1100; globalThis.window.dispatch('resize'); await settle(80);
    failNextWrite = true; const beforeFailure = autoWrites.length; await env.doc.querySelector('#undo-history').click(); await settle(300);
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false, 'automatic failure exposes feedback');
    assert.equal(hooks.snapshot().dirty, true, 'failed automatic save keeps dirty edits');
    assert.equal(autoWrites.length, beforeFailure);
    assert.equal(env.doc.querySelector('#save-feedback-retry').disabled, false);
    await env.doc.querySelector('#save-feedback-retry').click();
    assert.equal(await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length > beforeFailure) return true; await settle(20); } return false; })(), true, 'Retry saves after failure');
    assert.equal(hooks.snapshot().dirty, false);
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'successful Retry clears actionable failure feedback');
    const afterRetry = await hooks.decodeDocument(new Blob([autoWrites.at(-1)])); assert.equal(parentEntry(afterRetry.tree, noteIdBefore)?.name, 'Drag Map');
    assert.equal(maxWriters, 1, 'no overlapping writers after failure');
    await env.doc.querySelector('#redo-history').click(); await settle(180);
    const editorBase = autoWrites.length;
    let releaseEditorGate; rapidGate = new Promise((resolve) => { releaseEditorGate = resolve; });
    await env.doc.querySelector('#undo-history').click(); await settle(120);
    assert.equal(hooks.documentSaveState().inFlight, true, 'Undo automatic save is deferred at close');
    await env.doc.querySelector('#redo-history').click(); await settle(60);
    hooks.openDraft(); await settle(30);
    const draftForm = env.doc.querySelector('#editor-form'); assert.equal(draftForm.hidden, false, 'editor draft is open');
    const draftInput = findAll(draftForm, 'input').find((input) => input.type === 'text'); draftInput.value = 'Draft Should Not Persist'; await draftInput.dispatch('input'); hooks.touch(); await settle(20);
    releaseEditorGate(); rapidGate = null;
    assert.equal(await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length >= editorBase + 1) return true; await settle(20); } return false; })(), true, 'earlier close completes');
    assert.equal(autoWrites.length, editorBase + 1, 'draft blocks the later committed Redo save');
    assert.equal(hooks.snapshot().dirty, true, 'later Redo remains dirty while draft is open');
    await findAll(draftForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(40);
    const resumed = await (async () => { for (let i = 0; i < 150; i += 1) { if (autoWrites.length >= editorBase + 2 && hooks.snapshot().dirty === false) return true; await settle(20); } return false; })();
    assert.equal(resumed, true, 'editor Cancel resumes the pending Redo save');
    const afterEditorCancel = await hooks.decodeDocument(new Blob([autoWrites.at(-1)]));
    assert.equal(parentEntry(afterEditorCancel.tree, noteIdBefore)?.name, 'Target', 'final output contains committed Redo structure');
    assert.equal(afterEditorCancel.tree.name, 'Drag Map');
    const savedNote = afterEditorCancel.attachments.find((entry) => entry.name === 'note.txt'); assert.ok(savedNote);
    assert.equal(new TextDecoder().decode(Uint8Array.from(savedNote.bytes)), 'drag-bytes', 'exact attachment bytes after resumed save');
    assert.equal(JSON.stringify(afterEditorCancel).includes('Draft Should Not Persist'), false, 'cancelled draft text is absent');
    assert.equal(hooks.snapshot().dirty, false, 'dirty clears only after the later confirmed close');
    assert.equal(hooks.documentState().savedRevision, hooks.snapshot().dataRevision, 'resumed save records the live revision');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true);
    assert.equal(maxWriters, 1, 'resumed work remains serialized');

    const editorSaveBase = autoWrites.length;
    let releaseSaveGate; rapidGate = new Promise((resolve) => { releaseSaveGate = resolve; });
    await env.doc.querySelector('#undo-history').click(); await settle(120);
    hooks.openDraft(); await settle(30);
    const saveDraftForm = env.doc.querySelector('#editor-form'); assert.equal(saveDraftForm.hidden, false);
    const saveDraftInput = findAll(saveDraftForm, 'input').find((input) => input.type === 'text'); saveDraftInput.value = 'Submitted Draft'; await saveDraftInput.dispatch('input');
    const submitDraft = saveDraftForm.dispatch('submit', { preventDefault() {} }); await settle(40);
    releaseSaveGate(); rapidGate = null;
    await submitDraft;
    assert.equal(await (async () => { for (let i = 0; i < 200; i += 1) { if (hooks.snapshot().dirty === false && !hooks.documentSaveState().inFlight) return true; await settle(20); } return false; })(), true, 'explicit editor Save completes with pending automatic work');
    const afterEditorSave = await hooks.decodeDocument(new Blob([autoWrites.at(-1)]));
    assert.equal(afterEditorSave.tree.name, 'Submitted Draft', 'submitted editor value is saved');
    const submittedNote = afterEditorSave.attachments.find((entry) => entry.name === 'note.txt'); assert.ok(submittedNote);
    assert.equal(new TextDecoder().decode(Uint8Array.from(submittedNote.bytes)), 'drag-bytes', 'explicit editor Save keeps exact attachment bytes');
    assert.equal(JSON.stringify(afterEditorSave).includes('Draft Should Not Persist'), false);
    assert.equal(maxWriters, 1, 'explicit editor save and automatic save do not overlap');
    clearTimeout(r1Watchdog); writeLifecycleMarker('AUTO_EDITOR_R1_COMPLETE'); console.log('AUTO_EDITOR_R1_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.EDITOR_VISIBILITY) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    globalThis.window.innerWidth = 420; globalThis.window.dispatch('resize'); await settle(30);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true'); assert.equal(env.doc.querySelector('#details-content').hidden, true);
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Editor Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'editor-bytes')]; await fileInput.dispatch('change'); await settle(20);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true');
    const menuAction = async (name, label) => { hooks.openNodeMenu(name); await settle(20); const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); assert.ok(menu, 'menu missing for ' + name); await findAll(menu, 'button').find((button) => button.textContent === label).click(); await settle(40); };
    const folderAction = async (label) => { hooks.openFolderMenu(); await settle(20); const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); assert.ok(menu); await findAll(menu, 'button').find((button) => button.textContent === label).click(); await settle(40); };
    const cancelForm = async () => { const form = env.doc.querySelector('#editor-form'); await findAll(form, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(40); };
    await folderAction('Add Folder'); let state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.detailsHidden, false); assert.equal(state.detailsCollapsed, false); assert.equal(state.toggleDisabled, true); assert.equal(state.action, 'add-folder'); assert.equal(env.doc.activeElement, state.input);
    await cancelForm(); state = hooks.editorState(); assert.equal(state.formHidden, true); assert.equal(state.toggleDisabled, false); assert.equal(state.detailsHidden, false);
    await folderAction('Edit Folder'); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.action, 'edit-folder'); assert.equal(state.detailsHidden, false); await cancelForm();
    await folderAction('Add Data'); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.action, 'add-data'); assert.equal(state.detailsHidden, false); await cancelForm();
    await menuAction('note.txt', 'Edit Data'); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.action, 'edit-data'); const input = state.input; const form = env.doc.querySelector('#editor-form'); const searchHost = env.doc.querySelector('#search-results-host'); const searchMarker = env.doc.createElement('span'); searchMarker.textContent = 'search-marker'; searchHost.appendChild(searchMarker); assert.equal(env.doc.querySelector('#details-panel').dataset.editorActive, 'true'); assert.equal(env.doc.querySelector('#editor-prompt').hidden, true);
    input.value = 'rail draft'; await input.dispatch('input'); input.focus(); if (input.setSelectionRange) input.setSelectionRange(2, 4); const draftIdentity = input; const railToggle = env.doc.querySelector('#nav-rail-toggle'); await railToggle.click(); await settle(50); await railToggle.click(); await settle(50); assert.equal(state.input, draftIdentity); assert.equal(input.value, 'rail draft'); assert.equal(env.doc.activeElement, input); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false');
    input.value = ''; await input.dispatch('input'); await findAll(form, 'button').find((button) => button.textContent === 'Save').click(); await settle(150); state = hooks.editorState(); const errorText = state.error || env.doc.querySelector('#editor-error')?.textContent || '';
    input.selectionStart = 0; input.selectionEnd = 0; await input.dispatch('compositionstart'); assert.equal(hooks.editorState().composing, true);
    globalThis.window.innerWidth = 420; globalThis.window.dispatch('resize'); await settle(30); const narrowState = hooks.editorState(); assert.equal(narrowState.formHidden, false); assert.equal(narrowState.detailsHidden, false); assert.equal(narrowState.toggleDisabled, true); assert.equal(narrowState.input, input); assert.equal(narrowState.value, ''); assert.equal(narrowState.error, errorText); assert.equal(narrowState.composing, true); assert.equal(input.selectionStart, 0); assert.equal(input.selectionEnd, 0); assert.equal(env.doc.activeElement, input);
    env.doc.querySelector('#details-toggle').click(); await settle(20); assert.equal(hooks.editorState().detailsHidden, false);
    await input.dispatch('compositionend'); await cancelForm();
    globalThis.window.innerWidth = 1100; globalThis.window.dispatch('resize'); await settle(30); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'false'); env.doc.querySelector('#details-toggle').click(); await settle(20); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true');
    assert.equal(hooks.openNodeMenu('missing-node'), false); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true'); hooks.openFolderMenu(); await settle(20); assert.equal(env.doc.querySelector('#details-panel').dataset.collapsed, 'true');
    await menuAction('note.txt', 'Edit Data'); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.detailsHidden, false); assert.equal(state.toggleDisabled, true);
    await menuAction('note.txt', 'Edit Data'); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.detailsHidden, false); assert.equal(state.toggleDisabled, true);
    input.value = 'changed'; await input.dispatch('input'); const prompt = env.doc.querySelector('#editor-prompt'); await folderAction('Add Folder'); assert.equal(prompt.hidden, false); globalThis.window.innerWidth = 420; globalThis.window.dispatch('resize'); await settle(30); assert.equal(env.doc.querySelector('#details-content').hidden, false); assert.equal(prompt.hidden, false); globalThis.window.innerWidth = 1100; globalThis.window.dispatch('resize'); await settle(20); const tokenBeforeDiscard = hooks.editorState().formToken; await findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80); state = hooks.editorState(); assert.equal(state.formHidden, false); assert.equal(state.detailsHidden, false); assert.equal(state.action, 'add-folder'); assert.notEqual(state.formToken, tokenBeforeDiscard);
    await cancelForm(); assert.equal(env.doc.querySelector('#details-panel').dataset.editorActive, 'false'); assert.equal(searchHost.children.includes(searchMarker), true); state = hooks.editorState(); assert.equal(state.toggleDisabled, false); const geom = hooks.layoutGeometry(); assert.ok(geom.viewport.height > 0); assert.equal(geom.canvas.styleHeight, geom.viewport.height + 'px');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.SEARCH_DETAILS) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const searchToggle = env.doc.querySelector('#search-toggle'); const searchPanel = env.doc.querySelector('#search-panel'); const searchInput = env.doc.querySelector('#search-reserved'); const searchClose = env.doc.querySelector('#search-close'); const detailsPanel = env.doc.querySelector('#details-panel'); const detailsToggle = env.doc.querySelector('#details-toggle'); const detailsContent = env.doc.querySelector('#details-content');
    assert.equal(env.doc.querySelector('#details').textContent, 'No map loaded'); assert.equal(searchToggle.disabled, true);
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Search Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'search-bytes')]; await fileInput.dispatch('change'); await settle(20);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    assert.equal(searchPanel.hidden, true); assert.equal(searchToggle.getAttribute('aria-expanded'), 'false'); assert.equal(searchToggle.disabled, false);
    await searchToggle.click(); await settle(20); assert.equal(searchPanel.hidden, false); assert.equal(searchToggle.getAttribute('aria-expanded'), 'true'); assert.equal(env.doc.activeElement, searchInput);
    searchInput.value = 'note'; await searchInput.dispatch('input'); await settle(30); assert.ok(findAll(env.doc.body, '.search-card').length >= 1);
    await searchClose.click(); await settle(20); assert.equal(searchPanel.hidden, true); assert.equal(searchInput.value, 'note'); assert.equal(searchToggle.getAttribute('aria-expanded'), 'false');
    await searchToggle.click(); await settle(20); assert.equal(searchPanel.hidden, false); assert.equal(searchInput.value, 'note'); assert.ok(findAll(env.doc.body, '.search-card').length >= 1);
    await searchInput.dispatch('keydown', { key: 'Escape', isComposing: false, preventDefault() {} }); await settle(20); assert.equal(searchPanel.hidden, true);
    await searchToggle.click(); await settle(20); searchInput.value = '노트'; await searchInput.dispatch('compositionstart'); await searchInput.dispatch('keydown', { key: 'Escape', isComposing: true, preventDefault() {} }); assert.equal(searchPanel.hidden, false); await searchInput.dispatch('compositionend'); await settle(20); await searchInput.dispatch('keydown', { key: 'Escape', isComposing: false, preventDefault() {} }); assert.equal(searchPanel.hidden, true);
    globalThis.window.innerWidth = 420; globalThis.window.dispatch('resize'); await settle(40); assert.equal(detailsPanel.dataset.collapsed, 'true'); assert.equal(detailsContent.hidden, true); assert.equal(detailsToggle.getAttribute('aria-expanded'), 'false');
    await detailsToggle.click(); await settle(20); assert.equal(detailsPanel.dataset.collapsed, 'false'); assert.equal(detailsContent.hidden, false); await detailsToggle.click(); await settle(20); assert.equal(detailsContent.hidden, true);
    globalThis.window.innerWidth = 1100; globalThis.window.dispatch('resize'); await settle(40); assert.equal(detailsPanel.dataset.collapsed, 'false'); assert.equal(detailsContent.hidden, false);
    env.doc.querySelector('#graph-action-toolbar').offsetHeight = 78; hooks.resizeViewportTest(1100, 473); await settle(40); const expandedGeometry = hooks.layoutGeometry(); assert.equal(expandedGeometry.viewport.height, 395); assert.equal(expandedGeometry.canvas.styleHeight, '395px');
    const canvas = env.graphHost.children.find((child) => child.tagName === 'CANVAS'); hooks.setCanvasRect({ left: 0, top: 0, right: 1100, bottom: 431, width: 1100, height: 431 }); let emptyPoint = null; for (const [x, y] of [[2, 2], [1098, 2], [2, 429], [1098, 429], [1098, 215], [2, 215]]) { if (!hooks.hitTestClient(x, y)) { emptyPoint = { x, y }; break; } } assert.ok(emptyPoint); await canvas.dispatch('click', { clientX: emptyPoint.x, clientY: emptyPoint.y, button: 0, preventDefault() {}, stopPropagation() {} }); await settle(30);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.UI_GEOMETRY) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks);
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    globalThis.window.devicePixelRatio = 2;
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Geometry Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
    fileInput.files = [syntheticFile('geometry.txt', 'text/plain', 'geometry')]; await fileInput.dispatch('change'); await settle(20);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    const geometry = hooks.layoutGeometry(); const status = globalThis.window.__M5_EXPLORATION_STATUS__;
    assert.equal(geometry.wrapper.width, 1100); assert.equal(geometry.wrapper.height, 473); assert.equal(geometry.barHeight, 42);
    assert.equal(geometry.viewport.width, 1100); assert.equal(geometry.viewport.height, 431);
    assert.equal(geometry.canvas.styleWidth, '1100px'); assert.equal(geometry.canvas.styleHeight, '431px');
    assert.equal(geometry.canvas.width, 2200); assert.equal(geometry.canvas.height, 862);
    assert.equal(geometry.label.width, 1100); assert.equal(geometry.label.height, 431);
    assert.equal(status.labelMetrics.viewport.width, 1100); assert.equal(status.labelMetrics.viewport.height, 431);
    assert.equal(status.fitProjection.width, 1100); assert.equal(status.fitProjection.height, 431);
    const bounds = hooks.sceneBounds(); assert.ok(bounds.maxY <= 431 + 1);
    const center = hooks.nodeSceneCenter('Geometry Map'); assert.ok(center);
    const rect = { left: 120, top: 80, right: 1220, bottom: 497, width: 1100, height: 431 };
    const probe = hooks.coordinateProbe('Geometry Map', rect.left + center.center.x, rect.top + center.center.y, rect); assert.ok(probe);
    assert.equal(probe.ghostLeft, center.center.x); assert.equal(probe.ghostTop, center.center.y);
    assert.equal(probe.targetLeft + center.radius + 4, center.center.x); assert.equal(probe.targetTop + center.radius + 4, center.center.y);
    assert.equal(probe.hit, center.id);
    assert.equal(hooks.contextProbe(rect.left + center.center.x, rect.top + center.center.y, rect), center.id);
    assert.equal(hooks.contextProbe(rect.left + center.center.x, rect.top - 1, rect), null);
    const toolbarProbe = hooks.coordinateProbe('Geometry Map', rect.left + center.center.x, rect.top - 1, rect); assert.equal(toolbarProbe.hit, null);
    hooks.resizeViewportTest(900, 400); await settle(60); const resized = hooks.layoutGeometry();
    assert.equal(resized.canvas.styleWidth, '900px'); assert.equal(resized.canvas.styleHeight, '358px'); assert.equal(resized.label.height, 358);
    hooks.resizeViewportTest(420, 800); await settle(60); const narrow = hooks.layoutGeometry();
    assert.equal(narrow.canvas.styleWidth, '420px'); assert.equal(narrow.canvas.styleHeight, '758px');
    const appRoot = env.doc.querySelector('#app-root');
    appRoot.requestFullscreen = async () => { env.doc.fullscreenElement = appRoot; for (const fn of env.doc.listeners.get('fullscreenchange') || []) fn({ type: 'fullscreenchange' }); };
    env.doc.exitFullscreen = async () => { env.doc.fullscreenElement = null; for (const fn of env.doc.listeners.get('fullscreenchange') || []) fn({ type: 'fullscreenchange' }); };
    await env.doc.querySelector('#fullscreen-action').click(); await settle(30);
    assert.equal(env.doc.querySelector('#fullscreen-action').getAttribute('aria-label'), 'Exit fullscreen');
    hooks.resizeViewportTest(1400, 900); await settle(60); const full = hooks.layoutGeometry(); assert.equal(full.canvas.styleWidth, '1400px'); assert.equal(full.canvas.styleHeight, '858px');
    await env.doc.querySelector('#fullscreen-action').click(); await settle(30);
    assert.equal(env.doc.querySelector('#fullscreen-action').getAttribute('aria-label'), 'Enter fullscreen');
    const zero = hooks.resizeViewportTest(0, 0); assert.equal(zero.viewport.width, 0); assert.equal(zero.viewport.height, 0);
    hooks.resizeViewportTest(1100, 473); await settle(60); assert.equal(hooks.layoutGeometry().viewport.height, 431);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.CREATE_FALLBACK) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    delete globalThis.window.showSaveFilePicker; delete globalThis.window.showOpenFilePicker;
    await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(backdrop); const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Fallback Map'; await nameInput.dispatch('input'); await settle(120); await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click(); let wait = 0; while (!hooks.snapshot().hasMap && wait < 3000) { await settle(30); wait += 30; } assert.equal(hooks.snapshot().hasMap, true); await settle(400); assert.equal(hooks.treeSnapshot().name, 'Fallback Map'); assert.equal(hooks.treeSnapshot().children.length, 0); assert.equal(hooks.attachmentSnapshot().size, 0); assert.equal(hooks.snapshot().dirty, true); assert.equal(hooks.documentState().active, false); assert.equal(hooks.documentState().handle, null); assert.match(env.doc.querySelector('#shell-status').textContent, /Download started|cannot confirm|not guaranteed/i); let waitRecovery = 0; let checkpoint = null; while (waitRecovery < 3000) { checkpoint = await hooks.recoveryCheckpoint(); if (checkpoint?.checkpoint) break; await settle(30); waitRecovery += 30; } assert.ok(checkpoint?.checkpoint); assert.equal(checkpoint.checkpoint.tree.children.length, 0);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return;
  }
  if (process.env.CREATE_CLOSE_GATE) {
    const closeWatchdog = setTimeout(() => { writeLifecycleMarker('CLOSE_GATE_WATCHDOG'); console.error('CLOSE_GATE_WATCHDOG'); process.exit(70); }, 15000);
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    let writeCount = 0; let closeCount = 0; let releaseClose; const closeGate = new Promise((resolve) => { releaseClose = resolve; });
    const handle = { name: 'close-gate.orbit', async createWritable() { return { async write() { writeCount += 1; }, async close() { closeCount += 1; await closeGate; }, async abort() {} }; } };
    globalThis.window.showOpenFilePicker = async () => []; globalThis.window.showSaveFilePicker = async ({ suggestedName } = {}) => ({ ...handle, name: suggestedName || handle.name });
    await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Close Gate'; await nameInput.dispatch('input'); await settle(120); await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click(); let waitWrite = 0; while ((writeCount < 1 || closeCount < 1) && waitWrite < 3000) { await settle(30); waitWrite += 30; } assert.equal(writeCount, 1); assert.equal(closeCount, 1); assert.equal(hooks.documentState().active, false); assert.equal(hooks.snapshot().dirty, true); assert.doesNotMatch(env.doc.querySelector('#shell-status').textContent, /Created and saved/); releaseClose(); let waitSaved = 0; while (env.doc.querySelector('#save-state').textContent !== 'Saved' && waitSaved < 3000) { await settle(30); waitSaved += 30; } assert.equal(env.doc.querySelector('#save-state').textContent, 'Saved'); assert.equal(hooks.documentState().active, true); assert.equal(hooks.snapshot().dirty, false); assert.equal(writeCount, 1);
    clearTimeout(closeWatchdog); writeLifecycleMarker('CLOSE_GATE_COMPLETE'); console.log('CLOSE_GATE_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return;
  }
  if (process.env.CREATE_PICKER_MODE) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const mode = process.env.CREATE_PICKER_MODE;
    const watchdog = setTimeout(() => { writeLifecycleMarker('LIFECYCLE_WATCHDOG:' + mode); console.error('LIFECYCLE_WATCHDOG:' + mode); process.exit(70); }, 15000);
    let pickerCalls = 0; let pickerResolved = false; let releasePicker; let rejectPicker; let writeCount = 0; let savedBlob = null;
    const handle = { name: 'late.orbit', async createWritable() { return { async write(blob) { writeCount += 1; savedBlob = blob; }, async close() {}, async abort() {} }; } };
    globalThis.window.showOpenFilePicker = async () => [];
    if (mode === 'postinstall-destroy' || mode === 'postinstall-replace') {
      globalThis.window.showSaveFilePicker = async () => handle;
      hooks.deferNextRecoveryCheckpoint();
    } else {
      globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; return new Promise((resolve, reject) => { releasePicker = (value) => { pickerResolved = true; resolve(value); }; rejectPicker = (error) => { pickerResolved = true; reject(error); }; }); };
    }
    await env.desktopCreate.click();
    const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(backdrop);
    const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text');
    nameInput.value = 'Late Root'; await nameInput.dispatch('input'); await settle(120);
    const createButton = findAll(dialog, 'button').find((button) => button.textContent === 'Create Map');
    let createSettled = false; let createRejected = false;
    const createPromise = createButton.click().then(() => { createSettled = true; }, () => { createRejected = true; });
    if (mode === 'postinstall-destroy' || mode === 'postinstall-replace') {
      let wait = 0; while (!hooks.snapshot().hasMap && wait < 3000) { await settle(30); wait += 30; }
      assert.equal(hooks.snapshot().hasMap, true); const deferredBaseline = await hooks.recoveryCheckpoint(); assert.equal(deferredBaseline?.checkpoint || null, null); const treeBefore = hooks.treeSnapshot(); const attachmentBefore = hooks.attachmentSnapshot();
      if (mode === 'postinstall-destroy') for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
      else { hooks.replaceSession(); assert.equal(env.doc.querySelector('#shell-status').textContent, 'NEW SESSION'); }
      hooks.releaseRecoveryCheckpoint();
      await createPromise; await settle(150);
 assert.equal(createSettled, true);
      assert.equal(writeCount, 0);
      assert.equal(hooks.documentState().active, false);
      assert.equal(hooks.documentState().handle, null);
      if (mode === 'postinstall-replace') { assert.equal(env.doc.querySelector('#shell-status').textContent, 'NEW SESSION'); assert.equal(hooks.snapshot().hasMap, true); assert.deepEqual(hooks.treeSnapshot(), treeBefore); assert.deepEqual(hooks.attachmentSnapshot(), attachmentBefore); assert.equal(backdrop.hidden, false); }
      assert.equal(createRejected, false);
    } else {
      assert.equal(pickerCalls, 1);
      if (mode === 'destroy-success') {
        for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
        releasePicker(handle);
      } else if (mode === 'destroy-reject') {
        for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
        const error = new Error('picker rejected'); error.name = 'AbortError'; rejectPicker(error);
      } else if (mode === 'replace-session') {
        hooks.replaceSession(); assert.equal(env.doc.querySelector('#shell-status').textContent, 'NEW SESSION');
        releasePicker(handle);
      } else if (mode === 'dialog-cancel') {
        const cancelControl = findAll(dialog, 'button').filter((button) => button.textContent === 'Cancel').at(-1);
        assert.ok(cancelControl);
        await cancelControl.click(); await settle(30);
        assert.equal(backdrop.hidden, true);
        assert.equal(hooks.snapshot().hasMap, false);
        assert.equal(hooks.snapshot().creationOwned, false);
        const statusAfterCancel = env.doc.querySelector('#shell-status').textContent;
        releasePicker(handle);
        await createPromise; await settle(120);
        assert.equal(env.doc.querySelector('#shell-status').textContent, statusAfterCancel);
        assert.equal(hooks.snapshot().hasMap, false);
        assert.equal(writeCount, 0);
        assert.equal(hooks.documentState().active, false);
        assert.equal(hooks.documentState().handle, null);
        assert.equal(createRejected, false);
      }
      await createPromise; await settle(150);
 assert.equal(createSettled, true);
      assert.equal(hooks.snapshot().hasMap, false);
      assert.equal(writeCount, 0);
      assert.equal(hooks.documentState().active, false);
      assert.equal(hooks.documentState().handle, null);
      assert.equal(createRejected, false);
      assert.equal(pickerResolved, true);
      if (mode === 'replace-session') assert.equal(env.doc.querySelector('#shell-status').textContent, 'NEW SESSION');
    }
    clearTimeout(watchdog); writeLifecycleMarker('LIFECYCLE_COMPLETE:' + mode); console.log('LIFECYCLE_COMPLETE:' + mode);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return;
  }
  if (process.env.CREATE_BASELINE) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    let releaseWrite; const writeGate = new Promise((resolve) => { releaseWrite = resolve; }); let savedBlob = null;
    globalThis.window.showOpenFilePicker = async () => []; globalThis.window.showSaveFilePicker = async ({ suggestedName } = {}) => ({ name: suggestedName, async createWritable() { return { async write(blob) { await writeGate; savedBlob = blob; }, async close() {}, async abort() {} }; } });
    await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Baseline Root'; await nameInput.dispatch('input'); await settle(120); await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click(); let wait = 0; while (!hooks.snapshot().hasMap && wait < 3000) { await settle(30); wait += 30; } assert.equal(hooks.snapshot().hasMap, true); let cp = null; let waitCp = 0; while (waitCp < 3000) { cp = await hooks.recoveryCheckpoint(); if (cp?.checkpoint) break; await settle(30); waitCp += 30; } assert.ok(cp?.checkpoint); assert.equal(cp.checkpoint.tree.name, 'Baseline Root'); assert.equal(cp.checkpoint.tree.children.length, 0); releaseWrite(); let waitSaved = 0; while (env.doc.querySelector('#save-state').textContent !== 'Saved' && waitSaved < 3000) { await settle(30); waitSaved += 30; } assert.equal(hooks.snapshot().dirty, false); await hooks.flushRecovery(); const retired = await hooks.recoveryCheckpoint(); assert.equal(retired.checkpoint, null); assert.ok(savedBlob);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return;
  }
  if (process.env.TITLE_ONLY) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    let savedBlob = null; let suggestedName = null; let pickerCalls = 0; let writeCount = 0; let cancelFirst = true; let failNextCreateSave = false; globalThis.window.showSaveFilePicker = async ({ suggestedName: name } = {}) => { pickerCalls += 1; suggestedName = name; if (cancelFirst) { cancelFirst = false; const error = new Error('cancelled'); error.name = 'AbortError'; throw error; } return { name: 'solo.orbit', async createWritable() { return { async write(blob) { if (failNextCreateSave) { failNextCreateSave = false; throw new Error('injected creation write failure'); } writeCount += 1; savedBlob = blob; }, async close() {}, async abort() {} }; } }; }; globalThis.window.showOpenFilePicker = async () => [];
    await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(backdrop); const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text');
    nameInput.value = '   '; await nameInput.dispatch('input'); await settle(60); const nameError = findAll(dialog, 'p').find((node) => node.className === 'create-map-name-error'); assert.ok(nameError.textContent.trim()); const createButton = findAll(dialog, 'button').find((button) => button.textContent === 'Create Map'); assert.equal(createButton.disabled, true);
    nameInput.value = 'Solo Root'; await nameInput.dispatch('input'); await settle(120); assert.equal(createButton.disabled, false); await createButton.click(); await settle(200); assert.equal(hooks.snapshot().hasMap, false); assert.equal(backdrop.hidden, false); assert.equal(nameInput.value, 'Solo Root'); assert.equal(createButton.disabled, false); assert.match(env.doc.querySelector('.create-map-status').textContent, /cancelled/i); const createOnce = createButton.click(); const createDuplicate = createButton.click(); await Promise.all([createOnce, createDuplicate]); let waitSaved = 0; while (env.doc.querySelector('#save-state').textContent !== 'Saved' && waitSaved < 4000) { await settle(30); waitSaved += 30; }
    const rootTree = hooks.treeSnapshot(); assert.equal(rootTree.name, 'Solo Root'); assert.equal(rootTree.kind, 'folder'); assert.deepEqual(rootTree.children, []); assert.equal(hooks.attachmentSnapshot().size, 0); assert.equal(hooks.findNode('Solo Root')?.id, rootTree.id);
    const rootCenter = hooks.nodeSceneCenter('Solo Root'); assert.ok(rootCenter); assert.ok(rootCenter.radius > 0); hooks.setCanvasRect({ left: 0, top: 0, right: 1100, bottom: 431, width: 1100, height: 431 }); assert.equal(hooks.hitTestClient(rootCenter.center.x, rootCenter.center.y), rootTree.id);
    await hooks.flushRecovery(); const retired = await hooks.recoveryCheckpoint(); assert.equal(retired.checkpoint, null);
    const saved = await hooks.decodeDocument(savedBlob); assert.equal(saved.tree.children.length, 0); assert.equal(saved.tree.name, 'Solo Root'); assert.equal(saved.attachments.length, 0);
    const bytes = new Uint8Array(await savedBlob.arrayBuffer()); const file = { name: 'solo.orbit', size: bytes.byteLength, type: 'application/x-orbit', async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }, slice(start = 0, end = bytes.byteLength) { return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + end) }; } }; globalThis.window.showOpenFilePicker = async () => [{ name: 'solo.orbit', async getFile() { return file; }, async createWritable() { return { async write(blob) { writeCount += 1; savedBlob = blob; }, async close() {}, async abort() {} }; } }];
    await openViaFileChoice(env, 'Open map file'); await settle(350); assert.equal(hooks.treeSnapshot().children.length, 0); assert.equal(hooks.treeSnapshot().name, 'Solo Root'); assert.equal(hooks.snapshot().dirty, false);
    hooks.openFolderMenu(); await settle(20); let menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); assert.ok(menu); assert.ok(findAll(menu, 'button').some((button) => button.textContent === 'Add Data')); await findAll(menu, 'button').find((button) => button.textContent === 'Add Data').click(); await settle(30); const addDataForm = env.doc.querySelector('#editor-form'); assert.equal(addDataForm.hidden, false); await findAll(addDataForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30); hooks.openFolderMenu(); await settle(20); menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false); await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(30); const folderForm = env.doc.querySelector('#editor-form'); const folderInput = findAll(folderForm, 'input').find((input) => input.type === 'text'); folderInput.value = 'Child'; await folderInput.dispatch('input'); await folderForm.dispatch('submit', { preventDefault() {} }); let waitWrite = 0; while (writeCount < 2 && waitWrite < 3000) { await settle(30); waitWrite += 30; } assert.equal(hooks.treeSnapshot().children.length, 1); assert.equal(hooks.findNode('Child')?.kind, 'folder'); assert.equal(pickerCalls, 2); assert.equal(writeCount, 2, 'status=' + env.doc.querySelector('#shell-status').textContent + ' editorHidden=' + env.doc.querySelector('#editor-form').hidden + ' doc=' + JSON.stringify(hooks.documentState())); assert.equal(hooks.snapshot().dirty, false);
    await env.desktopCreate.click(); const replaceBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(replaceBackdrop); const replaceDialog = replaceBackdrop.children[0]; const replaceName = findAll(replaceDialog, 'input').find((input) => input.type === 'text'); replaceName.value = 'Replacement Title'; await replaceName.dispatch('input'); await settle(120); await findAll(replaceDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(40); const confirmCancel = findAll(replaceDialog, 'button').filter((button) => button.textContent === 'Cancel').at(-1); assert.ok(confirmCancel); await confirmCancel.click(); await settle(60); assert.equal(hooks.treeSnapshot().name, 'Solo Root'); assert.equal(hooks.treeSnapshot().children.length, 1);
    const packageBeforeFailure = savedBlob; failNextCreateSave = true; await env.desktopCreate.click(); const failBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(failBackdrop); const failDialog = failBackdrop.children[0]; const failName = findAll(failDialog, 'input').find((input) => input.type === 'text'); failName.value = 'Failure Map'; await failName.dispatch('input'); await settle(120); await findAll(failDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(40); await findAll(failDialog, 'button').find((button) => button.textContent === 'Replace map').click(); let waitFailure = 0; while (hooks.treeSnapshot()?.name !== 'Failure Map' && waitFailure < 3000) { await settle(30); waitFailure += 30; } assert.equal(hooks.treeSnapshot().name, 'Failure Map'); let waitFailureStatus = 0; while (!/save failed|could not be saved|remains unsaved/i.test(env.doc.querySelector('#shell-status').textContent) && waitFailureStatus < 3000) { await settle(30); waitFailureStatus += 30; } assert.match(env.doc.querySelector('#shell-status').textContent, /save failed|could not be saved|remains unsaved/i); assert.equal(hooks.snapshot().dirty, true); assert.equal(hooks.documentState().active, false); assert.equal(hooks.documentState().handle, null); assert.equal(writeCount, 2); const beforeFailureDoc = await hooks.decodeDocument(packageBeforeFailure); assert.equal(beforeFailureDoc.tree.name, 'Solo Root'); assert.ok(beforeFailureDoc.tree.children.length > 0); let waitIdle = 0; while (/Saving/.test(env.doc.querySelector('#save-state').textContent) && waitIdle < 3000) { await settle(30); waitIdle += 30; }
    await env.desktopSave.click(); let waitRetry = 0; while (hooks.snapshot().dirty && waitRetry < 3000) { await settle(30); waitRetry += 30; } assert.equal(hooks.snapshot().dirty, false, 'status=' + env.doc.querySelector('#shell-status').textContent + ' doc=' + JSON.stringify(hooks.documentState())); assert.equal(hooks.treeSnapshot().name, 'Failure Map'); assert.equal(hooks.documentState().active, true); assert.equal(writeCount, 3);
    cancelFirst = true; await env.desktopCreate.click(); const cancelReplacementBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); const cancelReplacementDialog = cancelReplacementBackdrop.children[0]; const cancelReplacementName = findAll(cancelReplacementDialog, 'input').find((input) => input.type === 'text'); cancelReplacementName.value = 'Cancelled Replacement'; await cancelReplacementName.dispatch('input'); await settle(120); await findAll(cancelReplacementDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(40); await findAll(cancelReplacementDialog, 'button').find((button) => button.textContent === 'Replace map').click(); await settle(200); assert.equal(hooks.treeSnapshot().name, 'Failure Map'); assert.equal(hooks.documentState().active, true); assert.equal(hooks.documentState().handleName, 'solo.orbit'); assert.equal(writeCount, 3); assert.match(env.doc.querySelector('.create-map-status').textContent, /cancelled|could not save|kept/i); const cancelReplacementCancel = findAll(cancelReplacementDialog, 'button').filter((button) => button.textContent === 'Cancel').at(-1); await cancelReplacementCancel.click(); await settle(60);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; return;
  }
  if (process.env.YAML_VIEWER) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    let savedBlob = null; let pickerCalls = 0; let writeCount = 0; let suggestedName = null; const saveHandle = { name: 'yaml.orbit', async createWritable() { return { async write(blob) { writeCount += 1; savedBlob = blob; }, async close() {}, async abort() {} }; } }; globalThis.window.showSaveFilePicker = async ({ suggestedName: name } = {}) => { pickerCalls += 1; suggestedName = name; return saveHandle; }; globalThis.window.showOpenFilePicker = async () => [];
    const yamlText = "\uFEFF한글:\n  - \"들여쓰기\"\n  - \"<script>alert(1)</script>\"\nmalformed: [unclosed\n";
    await env.desktopCreate.click(); const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0]; const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'YAML Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('name.yaml', '', yamlText)]; await fileInput.dispatch('change'); await settle(40);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); let waitCreate = 0; while ((!savedBlob || hooks.snapshot().dirty) && waitCreate < 3000) { await settle(30); waitCreate += 30; } assert.equal(hooks.findNode('name.yaml')?.kind, 'file'); assert.equal(hooks.snapshot().dirty, false); assert.equal(hooks.documentState().mode, 'writable'); assert.equal(pickerCalls, 1); assert.equal(suggestedName, 'YAML Map.orbit'); assert.equal(writeCount, 1);
    const exactBytes = Array.from(new TextEncoder().encode(yamlText)); assert.deepEqual(Array.from(await hooks.attachmentBytes('name.yaml')), exactBytes);
    assert.equal(hooks.openAttachmentByName('name.yaml'), true); await settle(120);
    let viewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false); assert.ok(viewer); assert.match(textOf(viewer), /한글:/); assert.match(textOf(viewer), /  - "들여쓰기"/); assert.match(textOf(viewer), /<script>alert\(1\)<\/script>/); assert.equal(findAll(viewer, 'script').length, 0);
    await findAll(viewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(40);
    const savedDoc = await hooks.decodeDocument(savedBlob); assert.deepEqual(savedDoc.attachments[0].bytes, exactBytes);
    assert.equal(hooks.snapshot().dirty, false);
    const openHandle = { name: 'yaml.orbit', async getFile() { return new File([savedBlob], 'yaml.orbit', { type: 'application/x-orbit' }); }, async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } }; globalThis.window.showOpenFilePicker = async () => [openHandle];
    await openViaFileChoice(env, 'Open map file'); await settle(350); if (env.doc.querySelector('.unsaved-map-backdrop') && !env.doc.querySelector('.unsaved-map-backdrop').hidden) { await findAll(env.doc.querySelector('.unsaved-map-backdrop'), 'button').find((button) => button.textContent === 'Save and continue')?.click(); await settle(250); }
    assert.deepEqual(Array.from(await hooks.attachmentBytes('name.yaml')), exactBytes); assert.equal(hooks.openAttachmentByName('name.yaml'), true); await settle(120); viewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false); assert.ok(viewer); assert.match(textOf(viewer), /한글:/); await findAll(viewer, 'button').find((button) => button.textContent === 'Close').click();
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.FEEDBACK_EXPIRY) {
    const watch = setTimeout(() => { writeLifecycleMarker('FEEDBACK_EXPIRY_WATCHDOG'); console.error('FEEDBACK_EXPIRY_WATCHDOG'); process.exit(70); }, 10000); watch.unref?.();
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Routine A', { kind: 'routine' }).timer, true);
    assert.equal(hooks.shellStatusState().kind, 'routine');
    assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine');
    assert.equal(hooks.shellStatusExpire(), true);
    assert.equal(hooks.shellStatusState().message, '');
    assert.equal(hooks.setShellStatusForTest('Routine A', { kind: 'routine' }).timer, true);
    assert.equal(hooks.setShellStatusForTest('Routine B', { kind: 'routine' }).timer, true);
    assert.equal(hooks.shellStatusExpirePrevious(), true);
    assert.equal(hooks.shellStatusState().message, 'Routine B', 'older expiry preserves newer routine');
    assert.equal(hooks.shellStatusExpire(), true);
    assert.equal(hooks.shellStatusExpire(), false);
    assert.equal(hooks.setShellStatusForTest('Routine before failure', { kind: 'routine' }).timer, true);
    assert.equal(hooks.setShellStatusForTest('Save failed', { kind: 'actionable' }).timer, false);
    assert.equal(hooks.shellStatusExpire(), false);
    assert.equal(hooks.shellStatusState().message, 'Save failed', 'actionable failure remains');
    assert.equal(hooks.setShellStatusForTest('Routine must not replace', { kind: 'routine' }).kind, 'actionable');
    assert.equal(hooks.shellStatusState().message, 'Save failed');
    hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Routine before conflict', { kind: 'routine' }).timer, true);
    assert.equal(hooks.setShellStatusForTest('External conflict', { kind: 'actionable' }).timer, false);
    assert.equal(hooks.shellStatusExpirePrevious(), true);
    assert.equal(hooks.shellStatusState().message, 'External conflict', 'obsolete routine callback preserves actionable error');
    hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Loading map', { kind: 'progress' }).timer, false);
    assert.equal(hooks.setShellStatusForTest('Routine during progress', { kind: 'routine' }).kind, 'progress');
    assert.equal(hooks.shellStatusState().message, 'Loading map');
    assert.equal(hooks.shellStatusExpire(), false);
    hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Routine session', { kind: 'routine' }).timer, true);
    hooks.replaceSession();
    assert.equal(hooks.shellStatusState().message, 'NEW SESSION');
    assert.equal(hooks.shellStatusState().timer, false);
    assert.equal(hooks.shellStatusExpire(), false);
    assert.equal(hooks.shellStatusExpirePrevious(), true);
    assert.equal(hooks.shellStatusState().message, 'NEW SESSION', 'session replacement invalidates routine expiry');
    hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Routine destroy', { kind: 'routine' }).timer, true);
    hooks.clearShellStatusForTest();
    assert.equal(hooks.setShellStatusForTest('Changes remain in this map but have not been saved.', { kind: 'actionable', transient: true }).timer, true);
    assert.equal(hooks.shellStatusState().hidden, false);
    assert.equal(hooks.shellStatusState().transient, true);
    await new Promise((resolve) => setTimeout(resolve, 3250));
    assert.equal(hooks.shellStatusState().message, '', 'transient notice dismisses after approximately three seconds');
    assert.equal(hooks.shellStatusState().hidden, true, 'dismissed notice is hidden');
    assert.equal(hooks.shellStatusState().timer, false);
    assert.equal(hooks.setShellStatusForTest('Older notice', { kind: 'actionable', transient: true }).timer, true);
    assert.equal(hooks.setShellStatusForTest('Newer notice', { kind: 'actionable', transient: true }).timer, true);
    assert.equal(hooks.shellStatusExpirePrevious(), true);
    assert.equal(hooks.shellStatusState().message, 'Newer notice', 'older timeout cannot hide newer notice');
    assert.equal(hooks.shellStatusExpire(), true);
    assert.equal(hooks.shellStatusState().hidden, true, 'current notice dismissal removes the box');
    hooks.destroyMain();
    assert.equal(hooks.shellStatusState().timer, false, 'destroy clears expiry timer');
    assert.equal(hooks.shellStatusExpire(), false);
    clearTimeout(watch); writeLifecycleMarker('FEEDBACK_EXPIRY_COMPLETE'); console.log('FEEDBACK_EXPIRY_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }

  if (process.env.SEARCH_HIGHLIGHT) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const watch = setTimeout(() => { console.error('SEARCH_HIGHLIGHT_WATCHDOG'); process.exit(70); }, 20000); watch.unref?.();
    const fixture = env.doc.querySelector('#fixture'); const searchToggle = env.doc.querySelector('#search-toggle'); const searchInput = env.doc.querySelector('#search-reserved');
    fixture.value = 'f20'; await fixture.dispatch('change'); await settle(250);
    assert.equal(hooks.searchHighlightState().ids.length, 0);
    await searchToggle.click(); await settle(20);
    searchInput.value = 'Node 15'; await searchInput.dispatch('input'); await settle(120);
    let state = hooks.searchHighlightState();
    assert.deepEqual(state.ids, ['n0', 'n1', 'n3', 'n7']);
    assert.equal(state.colors.n7.fill, '#B8BEC7'); assert.equal(state.colors.n7.stroke, '#60A5FA');
    assert.equal(state.folderColors.n8.fill, '#B8BEC7', 'unrelated folder keeps normal dark color');
    assert.match(state.status, /4 folders/i);
    const firstCard = env.doc.querySelector('.search-card'); assert.ok(firstCard); await firstCard.click(); await settle(350);
    assert.equal(hooks.searchHighlightState().query, 'Node 15'); assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7'], 'navigation transition preserves highlighting');
    searchInput.value = 'Node 8'; await searchInput.dispatch('input'); await settle(80);
    state = hooks.searchHighlightState();
    assert.deepEqual(state.ids, ['n0', 'n1', 'n3', 'n8']);
    assert.equal(state.colors.n8.stroke, '#60A5FA', 'matching folder outlined in blue');
    searchInput.value = 'Node 15'; await searchInput.dispatch('input'); await settle(80);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7']);
    searchInput.value = 'no-such-result'; await searchInput.dispatch('input'); await settle(60);
    assert.deepEqual(hooks.searchHighlightState().ids, [], 'no-match query restores normal colors');
    searchInput.value = 'Node 15'; await searchInput.dispatch('input'); await settle(60);
    await env.doc.querySelector('#search-close').click(); await settle(40);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7'], 'closing Search preserves active query highlighting');
    await searchToggle.click(); await settle(20); assert.equal(searchInput.value, 'Node 15');
    const clearButton = [...env.doc.querySelectorAll('button')].find((button) => button.textContent === 'Clear search'); assert.ok(clearButton); await clearButton.click(); await settle(80);
    state = hooks.searchHighlightState(); assert.equal(state.query, ''); assert.deepEqual(state.ids, []); assert.equal(state.status, ''); assert.equal(state.folderColors.n8.fill, '#B8BEC7', 'real Clear search restores normal colors');
    searchInput.value = 'Node 15'; await searchInput.dispatch('input'); await settle(80);
    await env.doc.querySelector('#theme-action').click(); await settle(40);
    state = hooks.searchHighlightState(); assert.equal(state.colors.n7.stroke, '#60A5FA'); assert.equal(state.folderColors.n8.fill, '#64748b');
    await env.doc.querySelector('#theme-action').click(); await settle(30);
    hooks.resizeViewportTest(900, 500); await settle(60); assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7'], 'viewport redraw preserves highlighting'); hooks.resizeViewportTest(1100, 473); await settle(60);
    hooks.openNodeMenu('Node 15'); await settle(30);
    const renameMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
    await findAll(renameMenu, 'button').find((button) => button.textContent === 'Edit Data').click(); await settle(30);
    const renameForm = env.doc.querySelector('#editor-form'); const renameInput = findAll(renameForm, 'input').find((input) => input.type === 'text');
    renameInput.value = 'Renamed 15'; await renameInput.dispatch('input'); await renameForm.dispatch('submit', { preventDefault() {} }); await settle(160);
    searchInput.value = 'Renamed 15'; await searchInput.dispatch('input'); await settle(80);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7'], 'rename updates matching highlighting');
    assert.equal(hooks.reparentTest('n15', 'n2').ok, true); await settle(120);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n2'], 'reparent updates ancestor highlighting');
    hooks.historyTest('undo'); await settle(80);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n1', 'n3', 'n7'], 'Undo restores matching ancestry');
    hooks.historyTest('redo'); await settle(80);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n2'], 'Redo reapplies matching ancestry');
    searchInput.value = ''; await searchInput.dispatch('input'); await settle(60);
    state = hooks.searchHighlightState(); assert.deepEqual(state.ids, []); assert.equal(state.status, ''); assert.equal(state.folderColors.n8.fill, '#B8BEC7');
    searchInput.value = 'Renamed 15'; await searchInput.dispatch('input'); await settle(60);
    assert.deepEqual(hooks.searchHighlightState().ids, ['n0', 'n2'], 'active query restored after manual clear');
    fixture.value = 'f200'; await fixture.dispatch('change'); await settle(250);
    state = hooks.searchHighlightState(); assert.equal(state.query, ''); assert.deepEqual(state.ids, [], 'direct dataset replacement clears stale highlight IDs'); assert.equal(state.status, ''); assert.equal(state.folderColors.n8.fill, '#B8BEC7', 'replacement frame has normal folder color');
    searchInput.value = 'Node'; await searchInput.dispatch('input'); await settle(100);
    state = hooks.searchHighlightState();
    assert.equal(state.ids.length, 40, 'complete matching set highlights all ancestor folders beyond card cap');
    assert.equal(state.colors.n39.stroke, '#60A5FA');
    fixture.value = 'f20'; await fixture.dispatch('change'); await settle(250);
    state = hooks.searchHighlightState(); assert.equal(state.query, ''); assert.deepEqual(state.ids, [], 'second direct dataset replacement clears stale highlighting'); assert.equal(state.folderColors.n8.fill, '#B8BEC7', 'replacement F20 frame redrawn normally');
    clearTimeout(watch); writeLifecycleMarker('SEARCH_HIGHLIGHT_COMPLETE'); console.log('SEARCH_HIGHLIGHT_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }

  if (process.env.NAV_RAIL) {
    const hooks = globalThis.window.__M5_P1B_TEST__; assert.ok(hooks); const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    globalThis.window.showSaveFilePicker = async () => ({ name: 'rail.orbit', async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } });
    await env.desktopCreate.click(); const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(createBackdrop); const createDialog = createBackdrop.children[0]; const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Rail Map';
    const fileInput = findAll(createDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'rail-bytes')]; await fileInput.dispatch('change'); await settle(30); await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
    const rail = env.doc.querySelector('#nav-rail'); const toggle = env.doc.querySelector('#nav-rail-toggle'); assert.ok(rail && toggle); assert.equal(rail.dataset.expanded, 'false'); assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await settle(40); assert.equal(rail.dataset.expanded, 'true'); assert.equal(toggle.getAttribute('aria-expanded'), 'true'); assert.equal(env.doc.querySelector('#nav-rail-toggle-label').textContent, 'Collapse');
    const help = env.doc.querySelector('#open-orbit-help'); const helpText = env.doc.querySelector('#open-orbit-help-text'); const openAction = env.doc.querySelector('#open-orbit-action'); const helpWrapper = help.parent; assert.equal(helpWrapper === openAction.parent, true, 'help and Open Orbit are siblings in one row'); assert.equal(helpText.parent, helpWrapper); assert.equal(help.getAttribute('aria-label'), 'About Orbit files'); assert.equal(helpText.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false');
    // pointerenter -> focus -> click must leave the help open.
    await help.dispatch('pointerenter'); help.focus(); await help.dispatch('focus'); await help.click(); assert.equal(helpText.hidden, false); assert.equal(help.getAttribute('aria-expanded'), 'true'); assert.match(helpText.textContent, /Open Orbit offers Orbit File/); await help.dispatch('pointerleave'); assert.equal(helpText.hidden, false, 'moving off the button alone does not close'); assert.equal(Boolean(env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false)), false, 'help never triggers Open');
    // Outside pointer interaction dismisses it.
        for (const fn of env.doc.listeners.get('pointerdown') || []) fn({ target: env.doc.body }); console.log('HELP_DEBUG_AFTER', helpText.hidden, help.getAttribute('aria-expanded')); assert.equal(helpText.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false');
    // focus -> keyboard activation (button click) leaves it open.
    help.focus(); await help.dispatch('focus'); await help.click(); assert.equal(helpText.hidden, false);
    for (const fn of env.doc.listeners.get('pointerdown') || []) fn({ target: env.doc.body });
    // touch-style focus -> click leaves it open.
    help.focus(); await help.dispatch('focus'); await help.click(); assert.equal(helpText.hidden, false);
    // Escape while focused closes and must not immediately reopen through focus.
    await help.dispatch('keydown', { key: 'Escape' }); assert.equal(helpText.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false'); help.focus(); await help.dispatch('focus'); assert.equal(helpText.hidden, true, 'focus after Escape does not reopen');
    // A later explicit click can reopen.
    await help.click(); assert.equal(helpText.hidden, false);
    // The pointer can move onto the tooltip without premature dismissal.
    await helpWrapper.dispatch('pointerleave'); assert.equal(helpText.hidden, false, 'pinned help survives pointer movement');
    await toggle.click(); await settle(20); assert.equal(helpText.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false'); await env.doc.querySelector('#settings-action').click(); await settle(20); assert.equal(env.doc.querySelector('#settings-panel').hidden, false); assert.equal(env.doc.querySelector('#settings-action').getAttribute('aria-expanded'), 'true'); assert.ok(findAll(env.doc.querySelector('#settings-panel'), 'button').some((button) => button.id === 'theme-action'));
    const beforeTheme = env.doc.documentElement.getAttribute('data-theme') || 'dark'; await env.doc.querySelector('#theme-action').click(); await settle(20); assert.notEqual(env.doc.documentElement.getAttribute('data-theme'), beforeTheme); await env.doc.querySelector('#theme-action').click();
    assert.deepEqual([...new Set(findAll(env.doc.querySelector('#settings-panel'), 'button').map((button) => button.id))], ['theme-action']);
    await toggle.click(); await settle(40); assert.equal(rail.dataset.expanded, 'false'); assert.equal(env.doc.querySelector('#settings-panel').hidden, true); assert.equal(helpText.hidden, true); assert.equal(help.getAttribute('aria-expanded'), 'false');
    const toolbarIds = [...new Set(env.doc.querySelector('#graph-action-toolbar').children)].filter((child) => String(child.tagName).toLowerCase() === 'button' && child.id).map((child) => child.id); assert.deepEqual(toolbarIds, ['search-toggle', 'undo-history', 'redo-history', 'embed-action', 'fullscreen-action', 'copy-map', 'download-backup']);
    const beforeDownload = hooks.snapshot(); const beforeDoc = hooks.documentState(); const downloaded = await hooks.startDownload(); assert.match(downloaded.filename, /\.orbit$/); assert.equal(hooks.snapshot().dirty, beforeDownload.dirty); assert.equal(hooks.documentState().handleName, beforeDoc.handleName); assert.equal(hooks.documentState().mode, beforeDoc.mode); assert.equal(hooks.documentState().name, beforeDoc.name); const downloadedDoc = await hooks.decodeDocument(downloaded.blob); assert.deepEqual(downloadedDoc.tree.children.map((child) => child.name), hooks.treeSnapshot().children.map((child) => child.name)); assert.deepEqual(downloadedDoc.attachments[0].bytes, Array.from(new TextEncoder().encode('rail-bytes')));
    let clickedFilename = null; const realCreateElement = env.doc.createElement.bind(env.doc); env.doc.createElement = (tag) => { const el = realCreateElement(tag); if (String(tag).toLowerCase() === 'a') { el.click = () => { clickedFilename = el.download; }; } return el; }; await env.doc.querySelector('#download-backup').click(); await settle(250); env.doc.createElement = realCreateElement; assert.match(clickedFilename || '', /\.orbit$/); assert.equal(hooks.snapshot().dirty, beforeDownload.dirty);
    const handoff = hooks.shellStatusState(); assert.equal(handoff.kind, 'routine'); assert.equal(handoff.timer, true); assert.match(handoff.message, /Download prepared.*handoff.*not guaranteed/i);
    assert.equal(hooks.shellStatusExpire(), true); assert.equal(hooks.shellStatusState().message, '');
    const realObjectUrl = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('injected download failure'); }; await env.doc.querySelector('#download-backup').click(); await settle(120); URL.createObjectURL = realObjectUrl;
    const failedDownload = hooks.shellStatusState(); assert.equal(failedDownload.kind, 'actionable'); assert.equal(failedDownload.timer, false); assert.match(failedDownload.message, /Download failed/); hooks.clearShellStatusForTest();
    const packageBlob = await hooks.exportPackage(); const packageBytes = new Uint8Array(await packageBlob.arrayBuffer());
    const opener = (name, bytes) => ({ name, async getFile() { return { name, size: bytes.byteLength, type: 'application/x-orbit', async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }, slice(start = 0, end = bytes.byteLength) { return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + end) }; } }; } });
    globalThis.window.showOpenFilePicker = async () => [opener('rail.orbit', packageBytes)];
    await openViaFileChoice(env, 'Open map file'); await settle(180); const openPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false); if (openPrompt) { await findAll(openPrompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(220); } assert.equal(hooks.snapshot().dirty, false, 'status=' + env.doc.querySelector('#shell-status').textContent + ' doc=' + JSON.stringify(hooks.documentState())); assert.equal(hooks.documentState().mode, 'writable'); assert.deepEqual(Array.from(await hooks.attachmentBytes('note.txt')), Array.from(new TextEncoder().encode('rail-bytes')));
    globalThis.window.showOpenFilePicker = async () => [opener('legacy.orbit', packageBytes)];
    await openViaFileChoice(env, 'Open map file'); await settle(350); assert.equal(hooks.documentState().mode, 'writable'); assert.equal(hooks.documentState().handleName, 'legacy.orbit'); assert.deepEqual(Array.from(await hooks.attachmentBytes('note.txt')), Array.from(new TextEncoder().encode('rail-bytes')));
    const stableTree = hooks.treeSnapshot(); const stableDoc = hooks.documentState(); const stableBytes = Array.from(await hooks.attachmentBytes('note.txt'));
    globalThis.window.showOpenFilePicker = async () => [opener('bad.orbit', new TextEncoder().encode('not a FileOrbit map'))];
    await openViaFileChoice(env, 'Open map file'); await settle(250); assert.equal(hooks.documentState().handleName, stableDoc.handleName); assert.deepEqual(hooks.treeSnapshot(), stableTree); assert.deepEqual(Array.from(await hooks.attachmentBytes('note.txt')), stableBytes);
    globalThis.window.showOpenFilePicker = async () => { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; };
    await openViaFileChoice(env, 'Open map file'); await settle(100); assert.equal(hooks.documentState().handleName, stableDoc.handleName);
    delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker; await openViaFileChoice(env, 'Open map file'); await settle(40); const fallbackInput = env.doc.querySelector('#fileorbit-backup-input'); assert.ok(fallbackInput); assert.match(fallbackInput.accept, /\.orbit/); assert.doesNotMatch(fallbackInput.accept, /\.fileorbit/); fallbackInput.files = [{ name: 'fallback.orbit', size: packageBytes.byteLength, type: 'application/x-orbit', async arrayBuffer() { return packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength); }, slice(start = 0, end = packageBytes.byteLength) { return { arrayBuffer: async () => packageBytes.buffer.slice(packageBytes.byteOffset + start, packageBytes.byteOffset + end) }; } }]; await fallbackInput.dispatch('change'); await settle(180); const fallbackPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false); if (fallbackPrompt) { await findAll(fallbackPrompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(220); } assert.equal(hooks.documentState().mode, 'download'); assert.equal(hooks.documentState().handle, null); assert.deepEqual(Array.from(await hooks.attachmentBytes('note.txt')), Array.from(new TextEncoder().encode('rail-bytes'))); globalThis.window.showOpenFilePicker = async () => [opener('rail.orbit', packageBytes)]; globalThis.window.showSaveFilePicker = async () => ({ name: 'rail.orbit', async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } });
    hooks.touch(); await settle(20); assert.equal(hooks.snapshot().dirty, true); globalThis.window.showOpenFilePicker = async () => [opener('rail.orbit', packageBytes)]; await openViaFileChoice(env, 'Open map file'); await settle(100); const dirtyPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false); assert.ok(dirtyPrompt); await findAll(dirtyPrompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(60); assert.equal(hooks.documentState().handle, null); assert.equal(hooks.snapshot().dirty, true);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_FAIL) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const watchdog = setTimeout(() => { console.error('ORBIT_FAIL_TIMEOUT'); process.exit(2); }, 45000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const createBackdrop = () => env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    const button = (root, label) => findAll(root, 'button').find((entry) => entry.textContent === label);
    const openCreate = async (title) => {
      await findAll(env.doc.querySelector('#nav-rail'), 'button').find((entry) => entry.dataset.action === 'create-map').click();
      assert.equal(await waitFor(() => Boolean(createBackdrop())), true);
      const backdrop = createBackdrop();
      const input = findAll(backdrop, 'input').find((entry) => entry.type === 'text');
      input.value = title; await input.dispatch('input');
      assert.equal(await waitFor(() => button(backdrop, 'Create Map')?.disabled === false), true);
      await button(backdrop, 'Create Map').click();
      if (!backdrop.hidden && button(backdrop, 'Replace map')) await button(backdrop, 'Replace map').click();
      return backdrop;
    };
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Empty Orbit'), true);
    globalThis.__M5_ORBIT_TEST_ENCODE_FAILURE__ = true;
    await openCreate('Prep Fail');
    assert.equal(await waitFor(() => Boolean(createBackdrop()) && /snapshot could not be prepared/i.test(textOf(createBackdrop()))), true);
    assert.equal(fixtures.emptyDirectory.entries.some((entry) => entry.name === 'Prep Fail.orbit'), false, 'preparation failure leaves no destination entry');
    globalThis.__M5_ORBIT_TEST_ENCODE_FAILURE__ = false;
    await button(createBackdrop(), 'Cancel').click();
    await settle(30);

    fixtures.emptyDirectory.__failNextCreateWrite = 'close';
    await openCreate('Close Fail');
    assert.equal(await waitFor(() => !hooks.documentSaveState().saving && /created, but the map was not confirmed saved/i.test(env.doc.querySelector('#shell-status').textContent)), true);
    const closeFail = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Close Fail.orbit');
    assert.ok(closeFail);
    assert.equal(closeFail.createWritableCalls, 1);
    assert.equal(hooks.documentState().active, false);
    assert.equal(hooks.snapshot().dirty, true);

    fixtures.emptyDirectory.__failNextGetAfterWrite = true;
    await openCreate('Base Fail');
    assert.equal(await waitFor(() => /baseline could not be verified/i.test(env.doc.querySelector('#shell-status').textContent)), true);
    assert.equal(hooks.snapshot().dirty, false);
    assert.ok(hooks.documentState().savedRevision >= 0);
    assert.notEqual(hooks.documentState().baseline.state, 'known');
    await settle(30);

    fixtures.emptyDirectory.__failNextCreateWrite = 'write';
    await openCreate('Broken');
    assert.equal(await waitFor(() => !hooks.documentSaveState().saving && /created, but the map was not confirmed saved/i.test(env.doc.querySelector('#shell-status').textContent)), true);
    const broken = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Broken.orbit');
    assert.ok(broken);
    assert.equal(broken.createWritableCalls, 1);
    assert.equal(hooks.snapshot().dirty, true, 'write failure leaves installed work unsaved');
    assert.equal(hooks.documentState().active, false, 'write failure does not adopt a destination');

    await openCreate('Broken');
    assert.equal(await waitFor(() => Boolean(createBackdrop()) && /already exists/i.test(textOf(createBackdrop()))), true, 'Retry rechecks leftovers');
    assert.equal(broken.createWritableCalls, 1, 'Retry does not overwrite the leftover');
    await button(createBackdrop(), 'Cancel').click();
    await settle(30);

    const preGate = { resolve: null }; preGate.promise = new Promise((resolve) => { preGate.resolve = resolve; });
    const preStarted = { resolve: null }; preStarted.promise = new Promise((resolve) => { preStarted.resolve = resolve; });
    globalThis.__M5_ORBIT_PRE_SAVE_GATE__ = { promise: preGate.promise, started: preStarted };
    const preCreate = openCreate('Pre Save');
    await preStarted.promise;
    hooks.replaceSession(); hooks.settleSession();
    preGate.resolve();
    await preCreate;
    await settle(80);
    globalThis.__M5_ORBIT_PRE_SAVE_GATE__ = null;
    const preFile = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Pre Save.orbit');
    assert.ok(preFile);
    assert.equal(preFile.createWritableCalls, 0, 'obsolete preencoded creation starts no writer');

    let releaseCreateGate;
    const createGateStarted = { resolve: null };
    createGateStarted.promise = new Promise((resolve) => { createGateStarted.resolve = resolve; });
    fixtures.emptyDirectory.__createGate = new Promise((resolve) => { releaseCreateGate = resolve; });
    fixtures.emptyDirectory.__createGateStarted = createGateStarted;
    const lateCreate = openCreate('Late');
    await fixtures.emptyDirectory.__createGateStarted.promise;
    hooks.destroyMain();
    releaseCreateGate();
    await lateCreate;
    await settle(120);
    const late = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Late.orbit');
    if (late) assert.equal(late.createWritableCalls, 0, 'stale creation must not write after destroy');
    assert.equal(hooks.documentSaveState().destroying, true);
    clearTimeout(watchdog);
    writeLifecycleMarker('ORBIT_FAIL_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_CREATE) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const watchdog = setTimeout(() => { console.error('ORBIT_CREATE_TIMEOUT'); process.exit(2); }, 60000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const orbitName = env.doc.querySelector('#orbit-name');
    const orbitList = env.doc.querySelector('#orbit-list');
    const createBackdrop = () => env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    const button = (root, label) => findAll(root, 'button').find((entry) => entry.textContent === label);
    const openCreate = async (title) => {
      await findAll(env.doc.querySelector('#nav-rail'), 'button').find((entry) => entry.dataset.action === 'create-map').click();
      assert.equal(await waitFor(() => Boolean(createBackdrop())), true);
      const backdrop = createBackdrop();
      const input = findAll(backdrop, 'input').find((entry) => entry.type === 'text');
      input.value = title; await input.dispatch('input');
      assert.equal(await waitFor(() => button(backdrop, 'Create Map')?.disabled === false), true, 'preview should enable Create Map');
      return { backdrop, input };
    };
    const submitCreate = async (backdrop) => {
      const saveCallsBefore = globalThis.__ORBIT_SAVE_PICKER_CALLS__ || 0;
      await button(backdrop, 'Create Map').click();
      if (!backdrop.hidden && button(backdrop, 'Replace map')) await button(backdrop, 'Replace map').click();
      await settle(100);
      return saveCallsBefore;
    };
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Empty Orbit'), true);
    globalThis.window.showSaveFilePicker = async () => { globalThis.__ORBIT_SAVE_PICKER_CALLS__ = (globalThis.__ORBIT_SAVE_PICKER_CALLS__ || 0) + 1; throw new Error('no per-map picker expected'); };
    const beforePicker = globalThis.__ORBIT_SAVE_PICKER_CALLS__ || 0;
    const titleOnly = await openCreate('Title Only');
    await submitCreate(titleOnly.backdrop);
    assert.equal(await waitFor(() => hooks.documentState().name === 'Title Only.orbit' && hooks.documentState().origin === 'orbit', 15000), true);
    assert.equal(globalThis.__ORBIT_SAVE_PICKER_CALLS__ || 0, beforePicker, 'no per-map Save picker');
    assert.deepEqual(hooks.treeSnapshot().children, []);
    assert.equal(hooks.treeSnapshot().name, 'Title Only');
    assert.equal(hooks.attachmentSnapshot().size, 0);
    assert.equal(hooks.documentState().baseline.state, 'known');
    const titleEntry = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Title Only.orbit');
    assert.ok(titleEntry);
    assert.equal(titleEntry.createWritableCalls, 1, 'one write/close path for title-only create');
    const titleDecoded = await hooks.decodeDocument(await titleEntry.getFile());
    assert.equal(titleDecoded.tree.name, 'Title Only');
    assert.deepEqual(titleDecoded.tree.children, []);
    assert.equal(titleDecoded.attachments.length, 0);
    assert.equal(await waitFor(() => findAll(orbitList, 'button').some((entry) => entry.getAttribute('aria-current') === 'true')), true);
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => hooks.documentState().baseline?.provenance === 'confirmed-write' && !hooks.documentSaveState().saving), true, 'created Orbit map uses the protected Save path');

    const populated = await openCreate('Populated');
    const fileInput = findAll(populated.backdrop, 'input').find((entry) => entry.type === 'file' && entry.multiple && !entry.hasAttribute('webkitdirectory'));
    fileInput.files = [syntheticFile('doc.pdf', 'application/pdf', '%PDF-1.4-orbit')];
    await fileInput.dispatch('change');
    assert.equal(await waitFor(() => button(populated.backdrop, 'Create Map')?.disabled === false), true);
    await submitCreate(populated.backdrop);
    assert.equal(await waitFor(() => hooks.documentState().name === 'Populated.orbit' && hooks.documentState().origin === 'orbit'), true);
    assert.deepEqual(Array.from(await hooks.attachmentBytes('doc.pdf')), Array.from(new TextEncoder().encode('%PDF-1.4-orbit')));
    const populatedEntry = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'Populated.orbit');
    assert.ok(populatedEntry);
    assert.equal(populatedEntry.createWritableCalls, 1);
    const populatedDecoded = await hooks.decodeDocument(await populatedEntry.getFile());
    assert.equal(populatedDecoded.tree.name, 'Populated');
    assert.deepEqual(populatedDecoded.attachments[0].bytes, Array.from(new TextEncoder().encode('%PDF-1.4-orbit')));

    const caseCollision = await openCreate('title only');
    await submitCreate(caseCollision.backdrop);
    assert.equal(await waitFor(() => Boolean(createBackdrop()) && /already exists|already taken/i.test(textOf(createBackdrop()))), true, 'case-equivalent collision is explicit');
    await button(createBackdrop(), 'Cancel').click();
    await settle(40);

    const zeroHandle = await fixtures.emptyDirectory.getFileHandle('Zero.orbit', { create: true });
    const collision = await openCreate('Zero');
    await submitCreate(collision.backdrop);
    assert.equal(await waitFor(() => Boolean(createBackdrop()) && /already exists|already taken/i.test(textOf(createBackdrop()))), true);
    assert.equal((await zeroHandle.getFile()).size, 0, 'existing zero-byte file remains untouched');
    assert.equal(await waitFor(() => createBackdrop() !== undefined), true, 'collision keeps creation draft available');
    await button(createBackdrop(), 'Cancel').click();
    await settle(40);

    await openViaFileChoice(env, 'Open map file');
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
    hooks.touch();
    await settle(30);
    clearTimeout(watchdog);
    writeLifecycleMarker('ORBIT_CREATE_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_R2) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const watchdog = setTimeout(() => { console.error('ORBIT_R2_TIMEOUT'); process.exit(2); }, 45000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const orbitName = env.doc.querySelector('#orbit-name');
    const orbitList = env.doc.querySelector('#orbit-list');
    const conflict = () => env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false);
    const entryButton = (name) => findAll(orbitList, 'button').find((button) => textOf(button).includes(name));
    const clickConflict = async (label) => { const dialog = conflict(); assert.ok(dialog, 'conflict dialog should be visible'); await findAll(dialog, 'button').find((button) => button.textContent === label).click(); await settle(60); };
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Orbit Alpha'), true);
    await entryButton('alpha.orbit').click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle && hooks.documentState().baseline?.state === 'known'), true);
    const originalGet = fixtures.mapHandle.getFile;
    const unreadable = () => ({ ...fakeOrbitFile('alpha.orbit', fixtures.mapHandle.bytes, 200), async arrayBuffer() { throw new Error('content unavailable'); } });
    fixtures.mapHandle.getFile = async () => unreadable();
    const before = {
      handle: hooks.documentState().handle,
      savedRevision: hooks.documentState().savedRevision,
      bytes: Array.from(await hooks.attachmentBytes('alpha.txt'))
    };
    const tryCopy = async (target, label) => {
      globalThis.window.showSaveFilePicker = async () => target;
      hooks.touch();
      await env.desktopSave.click();
      assert.equal(await waitFor(() => Boolean(conflict())), true, label + ' should show unverifiable conflict');
      await clickConflict('Save a Copy');
      assert.equal(await waitFor(() => !hooks.documentSaveState().saving), true, label + ' should settle');
      assert.equal(fixtures.mapHandle.createWritableCalls, 0, label + ' must not write the original');
      assert.equal(hooks.documentState().handle, before.handle, label + ' preserves destination');
      assert.equal(hooks.documentState().savedRevision, before.savedRevision, label + ' preserves savedRevision');
      assert.equal(hooks.snapshot().dirty, true, label + ' preserves dirty edits');
      assert.deepEqual(Array.from(await hooks.attachmentBytes('alpha.txt')), before.bytes, label + ' preserves attachments');
    };
    await tryCopy(fixtures.mapHandle, 'exact original handle');
    const twin = { ...fixtures.mapHandle, createWritableCalls: 0, async isSameEntry(other) { return other === fixtures.mapHandle; } };
    await tryCopy(twin, 'same-entry distinct handle');
    const identityFailure = { ...fixtures.mapHandle, createWritableCalls: 0, async isSameEntry() { throw new Error('identity comparison failed'); } };
    await tryCopy(identityFailure, 'identity comparison failure');

    fixtures.mapHandle.getFile = originalGet;
    fixtures.mapHandle.replace(fixtures.changedBytes, 200);
    const changedOriginalWrites = fixtures.mapHandle.createWritableCalls;
    globalThis.window.showSaveFilePicker = async () => fixtures.mapHandle;
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    await clickConflict('Save a Copy');
    assert.equal(await waitFor(() => !hooks.documentSaveState().saving), true);
    assert.equal(fixtures.mapHandle.createWritableCalls, changedOriginalWrites, 'changed original selected as copy is not overwritten');
    assert.equal(hooks.documentState().handle, fixtures.mapHandle);
    assert.equal(hooks.snapshot().dirty, true);

    const overwriteWritesBefore = fixtures.mapHandle.createWritableCalls;
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    await clickConflict('Replace Saved File');
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle && !hooks.documentSaveState().saving && hooks.snapshot().dirty === false), true);
    assert.ok(fixtures.mapHandle.createWritableCalls > overwriteWritesBefore, 'explicit Overwrite writes the original after approval');
    assert.equal(hooks.documentState().baseline.state, 'known');

    fixtures.mapHandle.replace(fixtures.changedBytes, 200);
    const copyWritesBefore = fixtures.copyHandle.createWritableCalls;
    globalThis.window.showSaveFilePicker = async () => fixtures.copyHandle;
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    await clickConflict('Save a Copy');
    const savedCopy = await waitFor(() => hooks.documentState().handle === fixtures.copyHandle && !hooks.documentSaveState().saving);
    assert.equal(savedCopy, true);
    assert.ok(fixtures.copyHandle.createWritableCalls > copyWritesBefore, 'distinct copy destination is written');
    assert.equal(hooks.documentState().baseline.state, 'known');
    assert.equal(hooks.snapshot().dirty, false);
    clearTimeout(watchdog);
    writeLifecycleMarker('ORBIT_R2_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_R1) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); const started = { resolve: null }; started.promise = new Promise((res) => { started.resolve = res; }); return { promise, resolve, reject, started }; };
    const watchdog = setTimeout(() => { console.error('ORBIT_R1_TIMEOUT'); process.exit(2); }, 45000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const orbitName = env.doc.querySelector('#orbit-name');
    const orbitList = env.doc.querySelector('#orbit-list');
    const conflict = () => env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false);
    const entryButton = (name) => findAll(orbitList, 'button').find((button) => textOf(button).includes(name));
    const navOpenFile = env.doc.querySelector('#open-orbit-action');
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Orbit Alpha'), true);
    await entryButton('alpha.orbit').click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle && hooks.documentState().baseline?.state === 'known'), true);

    const deferredA = deferred();
    const originalGet = fixtures.mapHandle.getFile;
    fixtures.mapHandle.getFile = () => { deferredA.started.resolve(); return deferredA.promise; };
    const pendingA = entryButton('alpha.orbit').click();
    await deferredA.started.promise;
    await openViaFileChoice(env, 'Open map file');
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
    assert.equal(await waitFor(() => { const state = hooks.openState(); return !state.persistenceBusy && !state.pendingImport && !state.installingImport && hooks.documentState().baseline?.verification?.reason === 'post-open-verification'; }), true, 'B open and baseline verification settle before baseline snapshot');
    const bState = {
      handle: hooks.documentState().handle,
      tree: JSON.stringify(hooks.treeSnapshot()),
      bytes: Array.from(await hooks.attachmentBytes('beta.txt')),
      dirty: hooks.snapshot().dirty,
      savedRevision: hooks.documentState().savedRevision,
      baseline: hooks.documentState().baseline,
      status: env.doc.querySelector('#shell-status').textContent
    };
    deferredA.resolve(fakeOrbitFile('alpha.orbit', fixtures.mapHandle.bytes, 200));
    await pendingA;
    await settle(100);
    assert.equal(hooks.documentState().handle, bState.handle, 'late Orbit Open must not replace B handle');
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle);
    assert.equal(JSON.stringify(hooks.treeSnapshot()), bState.tree, 'B tree unchanged');
    assert.deepEqual(Array.from(await hooks.attachmentBytes('beta.txt')), bState.bytes, 'B attachment bytes unchanged');
    assert.equal(hooks.snapshot().dirty, bState.dirty, 'B dirty state unchanged');
    assert.equal(hooks.documentState().savedRevision, bState.savedRevision, 'B savedRevision unchanged');
    assert.deepEqual(hooks.documentState().baseline, bState.baseline, 'B baseline unchanged');
    assert.equal(env.doc.querySelector('#shell-status').textContent, bState.status, 'B status unchanged');
    fixtures.mapHandle.getFile = originalGet;

    const deferredCreate = deferred();
    fixtures.mapHandle.getFile = () => { deferredCreate.started.resolve(); return deferredCreate.promise; };
    const pendingCreateA = entryButton('alpha.orbit').click();
    await deferredCreate.started.promise;
    await findAll(env.doc.querySelector('#nav-rail'), 'button').find((button) => button.dataset.action === 'create-map').click();
    assert.equal(await waitFor(() => Boolean(env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false))), true);
    deferredCreate.resolve(fakeOrbitFile('alpha.orbit', fixtures.mapHandle.bytes, 200));
    await pendingCreateA;
    await settle(80);
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'late Orbit Open must not replace B during Create Map');
    assert.equal(Boolean(env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false)), true, 'newer Create Map prompt remains');
    const createDialog = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Cancel').click();
    await settle(40);
    fixtures.mapHandle.getFile = originalGet;

    const deferredDestroy = deferred();
    fixtures.mapHandle.getFile = () => { deferredDestroy.started.resolve(); return deferredDestroy.promise; };
    const pendingDestroyA = entryButton('alpha.orbit').click();
    await deferredDestroy.started.promise;
    hooks.destroyMain();
    deferredDestroy.resolve(fakeOrbitFile('alpha.orbit', fixtures.mapHandle.bytes, 200));
    await pendingDestroyA;
    await settle(120);
    assert.equal(hooks.documentSaveState().destroying, true, 'destroyed app remains destroyed after late Orbit Open');
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'late Orbit Open did not change the destroyed document');
    clearTimeout(watchdog);
    writeLifecycleMarker('ORBIT_R1_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
﻿  if (process.env.FILE_OPEN_NAV || process.env.FILE_OPEN_NAV_UNSUPPORTED) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const watchdog = setTimeout(() => { console.error('FILE_OPEN_NAV_TIMEOUT'); process.exit(2); }, 45000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const navItems = env.doc.querySelector('#nav-rail-items');
    const directButtons = navItems.children.filter((child) => child.tagName === 'BUTTON');
    assert.equal(directButtons.some((button) => button.dataset.action === 'save-map'), false, 'no primary rail Save');
    assert.equal(env.doc.querySelector('#orbit-action'), null);
    assert.equal(env.doc.querySelector('#orbit-open'), null);
    assert.equal([...new Set(findAll(env.doc.querySelector('#settings-panel'), 'button').map((button) => button.id))].length, 1);
    assert.equal(findAll(env.doc.querySelector('#settings-panel'), 'button')[0].id, 'theme-action');
﻿    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    let openPickerCalls = 0; const originalOpen = globalThis.window.showOpenFilePicker;
    globalThis.window.showOpenFilePicker = async (...args) => { openPickerCalls += 1; return originalOpen(...args); };
    await env.doc.querySelector('[data-action="open-document"]').click();
    const browser = () => env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    assert.ok(browser());
    assert.equal(textOf(browser()).includes('No Orbit selected'), true);
    const browserButtons = () => findAll(browser(), 'button');
    assert.deepEqual(browserButtons().filter((button) => !button.hidden).map((button) => button.textContent), ['Choose folder', 'Refresh', 'Open file elsewhere…', 'Close']);
    assert.equal(browserButtons().find((button) => button.textContent === 'Refresh').disabled, true);
    if (process.env.FILE_OPEN_NAV_UNSUPPORTED) {
      assert.equal(browserButtons().find((button) => button.textContent === 'Choose folder').disabled, true);
      assert.match(textOf(browser()), /folder access is not available/i);
    }
    if (process.env.FILE_OPEN_NAV) {
      globalThis.__M5_ORBIT_PICK__ = 'cancel';
      await browserButtons().find((button) => button.textContent === 'Choose folder').click();
      assert.equal(await waitFor(() => /cancel/i.test(env.doc.querySelector('#shell-status').textContent)), true);
      assert.equal(Boolean(browser()), true, 'picker cancellation keeps the integrated dialog open');
      assert.equal(env.doc.querySelector('#orbit-name').textContent, 'No Orbit');
      globalThis.__M5_ORBIT_PICK__ = 'directory';
      await browserButtons().find((button) => button.textContent === 'Choose folder').click();
      assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Empty Orbit'), true);
      assert.equal(Boolean(browser()), true, 'folder selection keeps the integrated dialog open');
      assert.equal(hooks.documentState().handle, null, 'folder selection does not open the first map');
      assert.equal(textOf(browser()).includes('No top-level .orbit files'), true);
      assert.equal(browserButtons().find((button) => button.textContent === 'Change folder').disabled, false);

      await browserButtons().find((button) => button.textContent === 'Open file elsewhere…').click();
      assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
      assert.equal(Boolean(browser()), false, 'standalone Open closes the browser before the shared open path');
      assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Empty Orbit', 'standalone Open does not change Orbit');
      assert.equal(await waitFor(() => !hooks.snapshot().busy && !hooks.pendingImportState().pending), true);

      const reopenButton = env.doc.querySelector('[data-action="open-document"]');
      assert.equal(await waitFor(() => /^Opened /.test(env.doc.querySelector('#shell-status').textContent)
        && !hooks.pendingImportState().pending && !hooks.pendingImportState().installing
        && hooks.openState().block === null && reopenButton.disabled === false), true, 'standalone Open install settled before reopening the browser');
      assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine', 'Open completion is nonvisual routine feedback');
      await reopenButton.click();
      const reopened = await waitFor(() => Boolean(browser())
        && browserButtons().find((button) => button.textContent === 'Refresh').disabled === false);
      assert.equal(reopened, true, 'reopened browser is ready');
      assert.equal(textOf(browser()).includes('Empty Orbit'), true, 'connected Orbit list is available');
      await browserButtons().find((button) => button.textContent === 'Refresh').click();
      assert.equal(await waitFor(() => Boolean(browser()) && browserButtons().find((button) => button.textContent === 'Refresh').disabled === false), true, 'Refresh keeps the dialog open and settles');
      assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine', 'Refresh success is nonvisual routine feedback');

      globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory;
      await browserButtons().find((button) => button.textContent === 'Change folder').click();
      assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
      assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'folder change alone does not replace the live map');
      assert.equal(textOf(browser()).includes('alpha.orbit'), true, 'changed folder populates the same dialog');
      assert.equal(textOf(browser()).includes('notes.txt'), false, 'non-map files are not listed');

      await browserButtons().find((button) => button.textContent === 'alpha.orbit').click();
      assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle), true);
      assert.equal(Boolean(browser()), false, 'listed map opens through the existing protected path and closes the dialog');
      assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Orbit Alpha');
      hooks.touch(); await settle(20);
      assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine', 'integrated-list Open settles as nonvisual routine feedback');
      await env.doc.querySelector('[data-action="open-document"]').click();
      await browserButtons().find((button) => button.textContent === 'alpha.orbit').click();
      const dirtyPrompt = await waitFor(() => env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false));
      assert.equal(dirtyPrompt, true, 'listed map Open coordinates with the existing dirty replacement prompt');
      assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'actionable', 'pending dirty decision remains visible');
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Cancel').click();
      await settle(40);
      assert.equal(hooks.documentState().handle, fixtures.mapHandle, 'dirty replacement Cancel preserves the current listed map');
      assert.equal(hooks.snapshot().dirty, true);
    } else {
      // Unsupported branch: folder controls are disabled; standalone Open remains usable.
      assert.equal(browserButtons().find((button) => button.textContent === 'Choose folder').disabled, true);
      assert.match(textOf(browser()), /folder access is not available/i);
      await browserButtons().find((button) => button.textContent === 'Open file elsewhere…').click();
      assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
      assert.equal(Boolean(browser()), false);
    }
    if (process.env.FILE_OPEN_NAV) {
      hooks.touch(); await settle(30);
    assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
    await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(300);
    assert.equal(await waitFor(() => hooks.snapshot().dirty === false && !hooks.documentSaveState().saving), true);
    assert.equal(env.saveState.textContent, 'Saved');

      globalThis.window.showOpenFilePicker = async () => [fixtures.legacyHandle];
      assert.equal(await waitFor(() => env.doc.querySelector('[data-action="open-document"]').disabled === false), true, 'Open File is available for legacy Open');
      await env.doc.querySelector('[data-action="open-document"]').click();
      assert.equal(await waitFor(() => Boolean(browser())), true, 'Open File still works with a connected Orbit');
      await browserButtons().find((button) => button.textContent === 'Open file elsewhere…').click();
      assert.equal(await waitFor(() => hooks.documentState().mode === 'writable' && hooks.documentState().handleName === 'legacy.orbit'), true);
      assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Orbit Alpha', 'standalone .orbit Open does not change Orbit');
      assert.equal(env.doc.querySelector('#orbit-section').hidden, false, 'connected Orbit remains without a close control');
    }
    clearTimeout(watchdog);
    writeLifecycleMarker(process.env.FILE_OPEN_NAV_UNSUPPORTED ? 'FILE_OPEN_NAV_UNSUPPORTED_COMPLETE' : 'FILE_OPEN_NAV_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.FILE_OPEN_BROWSER_STALE) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const watchdog = setTimeout(() => { console.error('FILE_OPEN_BROWSER_STALE_TIMEOUT'); process.exit(2); }, 45000);
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const openFile = env.doc.querySelector('[data-action="open-document"]');
    const browser = () => env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    const buttons = () => findAll(browser(), 'button');
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    await openFile.click();
    assert.ok(browser());
    const firstGate = { resolve: null }; firstGate.promise = new Promise((resolve) => { firstGate.resolve = resolve; });
    const firstStarted = { resolve: null }; firstStarted.promise = new Promise((resolve) => { firstStarted.resolve = resolve; });
    globalThis.window.showDirectoryPicker = async () => { firstStarted.resolve(); return firstGate.promise; };
    const firstChoose = buttons().find((button) => button.textContent === 'Choose folder').click();
    await firstStarted.promise;
    hooks.replaceSession(); hooks.settleSession();
    const replacementStatus = env.doc.querySelector('#shell-status').textContent;
    firstGate.resolve(fixtures.emptyDirectory); await firstChoose; await settle(100); console.log('STALE_STAGE_1');
    assert.equal(env.doc.querySelector('#shell-status').textContent, replacementStatus, 'stale folder completion does not overwrite replacement feedback');
    assert.equal(textOf(browser()).includes('No Orbit selected'), true, 'stale folder completion does not update the dialog');
    assert.equal(Boolean(env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false)), false, 'stale folder completion opens no form');
    await buttons().find((button) => button.textContent === 'Close').click();
    hooks.closeOrbitTest(); await settle(40);

    globalThis.window.showDirectoryPicker = async () => fixtures.emptyDirectory;
    await openFile.click(); assert.ok(browser());
    const closeReopenGate = { resolve: null }; closeReopenGate.promise = new Promise((resolve) => { closeReopenGate.resolve = resolve; });
    const closeReopenStarted = { resolve: null }; closeReopenStarted.promise = new Promise((resolve) => { closeReopenStarted.resolve = resolve; });
    globalThis.window.showDirectoryPicker = async () => { closeReopenStarted.resolve(); return closeReopenGate.promise; };
    const choose = buttons().find((button) => button.textContent === 'Choose folder').click();
    await closeReopenStarted.promise;
    await buttons().find((button) => button.textContent === 'Close').click();
    await openFile.click();
    const reopened = browser(); assert.ok(reopened);
    closeReopenGate.resolve(fixtures.emptyDirectory); await choose; await settle(100); console.log('STALE_STAGE_3');
    assert.equal(Boolean(browser()), true);
    assert.equal(textOf(browser()).includes('No Orbit selected'), true, 'late result cannot update the reopened dialog');

    globalThis.window.showDirectoryPicker = async () => fixtures.emptyDirectory;
    await openFile.click(); assert.ok(browser());
    const destroyGate = { resolve: null }; destroyGate.promise = new Promise((resolve) => { destroyGate.resolve = resolve; });
    const destroyStarted = { resolve: null }; destroyStarted.promise = new Promise((resolve) => { destroyStarted.resolve = resolve; });
    globalThis.window.showDirectoryPicker = async () => { destroyStarted.resolve(); return destroyGate.promise; };
    const destroyChoose = buttons().find((button) => button.textContent === 'Choose folder' || button.textContent === 'Change folder').click();
    await destroyStarted.promise;
    hooks.destroyMain();

    destroyGate.resolve(fixtures.emptyDirectory); await destroyChoose; await settle(80);

    assert.equal(hooks.documentSaveState().destroying, true);
    clearTimeout(watchdog);
    writeLifecycleMarker('FILE_OPEN_BROWSER_STALE_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
﻿  if (process.env.AUTO_CONFLICT) {
    const r2Watchdog = setTimeout(() => { writeLifecycleMarker('AUTO_CONFLICT_R2_WATCHDOG'); console.error('AUTO_CONFLICT_R2_WATCHDOG'); process.exit(70); }, 20000); r2Watchdog.unref?.();
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__; const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const conflict = () => env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false);
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
    const browserClose = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    if (browserClose) await findAll(browserClose, 'button').find((button) => button.textContent === 'Close').click();
    const entry = findAll(env.doc.querySelector('#orbit-list'), 'button').find((button) => textOf(button).includes('alpha.orbit'));
    await entry.click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle && hooks.snapshot().dirty === false), true);
    hooks.openFolderMenu(); await settle(20); const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
    await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
    const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Auto Target'; await input.dispatch('input'); await form.dispatch('submit', { preventDefault() {} });
    await waitFor(() => hooks.editorState().formHidden && !hooks.documentSaveState().inFlight);
    const target = hooks.findNode('Auto Target'); const note = hooks.findNode('alpha.txt'); assert.ok(target && note);
    const writesBefore = fixtures.mapHandle.createWritableCalls;
    hooks.reparentTest(note.id, target.id);
    assert.equal(await waitFor(() => fixtures.mapHandle.createWritableCalls > writesBefore), true, 'structural edit auto-saves Orbit map');
    fixtures.mapHandle.replace(fixtures.changedBytes, 400);
    const writesAfterFirst = fixtures.mapHandle.createWritableCalls;
    hooks.historyTest('undo');
    assert.equal(await waitFor(() => env.doc.querySelector('#save-feedback').hidden === false), true, 'external conflict stops automatic save');
    assert.equal(Boolean(conflict()), false, 'automatic conflict does not open a dialog');
    assert.equal(hooks.snapshot().dirty, true);
    assert.equal(fixtures.mapHandle.createWritableCalls, writesAfterFirst, 'no automatic overwrite after conflict');
    const unsavedText = 'Changes remain in this map but have not been saved.';
    const visibleUnsavedCount = () => {
      const shell = env.doc.querySelector('#shell-status');
      const feedback = env.doc.querySelector('#save-feedback');
      const feedbackText = env.doc.querySelector('#save-feedback-text');
      const editorForm = env.doc.querySelector('#editor-form');
      const editorStatus = env.doc.querySelector('#editor-status');
      return [
        !shell.hidden && shell.textContent === unsavedText,
        !feedback.hidden && feedbackText.textContent === unsavedText,
        !editorForm.hidden && editorStatus.textContent === unsavedText
      ].filter(Boolean).length;
    };
    let pickerCalls = 0;
    const originalSavePicker = globalThis.window.showSaveFilePicker;
    globalThis.window.showSaveFilePicker = async (...args) => { pickerCalls += 1; return originalSavePicker ? originalSavePicker(...args) : null; };
    await env.doc.querySelector('#save-feedback-retry').click();
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'explicit Retry opens the conflict decision');
    await findAll(conflict(), 'button').find((button) => button.textContent === 'Cancel').click(); await settle(150);
    assert.equal(pickerCalls, 0, 'conflict Cancel opens no save picker');
    const afterCancel = fixtures.mapHandle.createWritableCalls;
    await settle(250);
    assert.equal(fixtures.mapHandle.createWritableCalls, afterCancel, 'conflict Cancel does not reopen an automatic attempt');
    assert.equal(hooks.snapshot().dirty, true);
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false, 'Cancel keeps actionable unsaved feedback');
    assert.equal(env.doc.querySelector('#save-feedback-text').textContent, 'Changes remain in this map but have not been saved.');
    assert.doesNotMatch(env.doc.querySelector('#save-feedback-text').textContent, /AbortError|showSaveFilePicker|stack/i);
    assert.equal(env.doc.querySelector('#save-feedback-retry').disabled, false, 'Cancel keeps Retry usable');
    assert.equal(env.doc.querySelector('#save-feedback-save-as').disabled, false, 'Cancel keeps Save As usable');
    assert.equal(visibleUnsavedCount(), 1, 'retry conflict Cancel shows the unsaved message exactly once');
    assert.notEqual(env.doc.querySelector('#shell-status').textContent, unsavedText, 'save-feedback owns the unsaved message with no shell duplicate');
    await new Promise((resolve) => setTimeout(resolve, 3150));
    assert.equal(env.doc.querySelector('#save-feedback-text').textContent, '', 'save-feedback notice text dismisses after approximately three seconds');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false, 'actionable recovery controls remain');
    assert.equal(env.doc.querySelector('#save-feedback-retry').disabled, false);
    assert.equal(env.doc.querySelector('#save-feedback-save-as').disabled, false);
    assert.equal(visibleUnsavedCount(), 0, 'transient text is gone after approximately three seconds');
    const writesBeforeSaveAsCancel = fixtures.mapHandle.createWritableCalls;
    const pickersBeforeSaveAs = pickerCalls;
    globalThis.__M5_ORBIT_SAVE_PICK__ = 'cancel';
    await env.doc.querySelector('#save-feedback-save-as').click(); await settle(160);
    assert.equal(pickerCalls, pickersBeforeSaveAs + 1, 'Save As recovery opens the picker');
    assert.equal(fixtures.mapHandle.createWritableCalls, writesBeforeSaveAsCancel, 'Save As picker cancel writes nothing');
    assert.equal(visibleUnsavedCount(), 1, 'Save As picker cancel shows one unsaved message');
    assert.notEqual(env.doc.querySelector('#shell-status').textContent, unsavedText);
    assert.equal(hooks.snapshot().dirty, true);
    assert.equal(env.doc.querySelector('#save-feedback-retry').disabled, false);
    assert.equal(env.doc.querySelector('#save-feedback-save-as').disabled, false);
    globalThis.__M5_ORBIT_SAVE_PICK__ = null;
    hooks.historyTest('redo'); await settle(120);
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false, 'later mutation does not clear paused feedback');
    assert.equal(Boolean(conflict()), false, 'later mutation does not open a conflict dialog');
    assert.equal(fixtures.mapHandle.createWritableCalls, afterCancel, 'later mutation does not auto-write while paused');
    await env.doc.querySelector('#save-feedback-retry').click();
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'repeated Retry remains explicit');
    await findAll(conflict(), 'button').find((button) => button.textContent === 'Cancel').click(); await settle(150);
    assert.equal(fixtures.mapHandle.createWritableCalls, afterCancel, 'repeated Cancel writes nothing');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, false, 'repeated Cancel keeps feedback');
    assert.equal(visibleUnsavedCount(), 1, 'repeated conflict Cancel keeps one unsaved message');
    assert.notEqual(env.doc.querySelector('#shell-status').textContent, unsavedText);
    assert.equal(pickerCalls, 1, 'repeated conflict Cancel adds no picker call');
    await env.doc.querySelector('#save-feedback-retry').click();
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'later Retry opens the conflict');
    await findAll(conflict(), 'button').find((button) => button.textContent === 'Replace Saved File').click();
    assert.equal(await waitFor(() => env.doc.querySelector('#save-feedback').hidden === true && hooks.snapshot().dirty === false), true, 'later explicit Retry resolves');
    assert.ok(fixtures.mapHandle.createWritableCalls > afterCancel, 'resolution writes the live document');
    fixtures.mapHandle.replace(fixtures.changedBytes, 401);
    hooks.historyTest('undo');
    assert.equal(await waitFor(() => env.doc.querySelector('#save-feedback').hidden === false), true, 'new conflict exposes feedback again');
    const previousOpen = globalThis.window.showOpenFilePicker; globalThis.window.showOpenFilePicker = async () => [fixtures.mapHandle];
    await openViaFileChoice(env, 'Open map file'); await settle(120);
    const replacePrompt = await (async () => { for (let i = 0; i < 150; i += 1) { const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false); if (prompt) return prompt; await settle(20); } return null; })();
    assert.ok(replacePrompt, 'actual dirty replacement prompt appears');
    await findAll(replacePrompt, 'button').find((button) => button.textContent === 'Discard changes').click();
    await settle(350);
    assert.equal(hooks.documentState().handle, fixtures.mapHandle, 'actual Open replacement installs');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'replacement invalidates old feedback');
    assert.equal(env.doc.querySelector('#save-feedback-retry').disabled, true, 'old Retry is no longer actionable');
    assert.equal(env.doc.querySelector('#save-feedback-save-as').disabled, true, 'old Save As is no longer actionable');
    clearTimeout(r2Watchdog); writeLifecycleMarker('AUTO_CONFLICT_R2_COMPLETE'); console.log('AUTO_CONFLICT_R2_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }

  if (process.env.CREATE_LOCATION_UNSUPPORTED) {
    const watch = setTimeout(() => { writeLifecycleMarker('CREATE_LOCATION_UNSUPPORTED_WATCHDOG'); console.error('CREATE_LOCATION_UNSUPPORTED_WATCHDOG'); process.exit(70); }, 15000); watch.unref?.();
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const backdrop = () => env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    const button = (root, label) => findAll(root, 'button').find((entry) => entry.textContent === label);
    let downloads = 0; const realCreate = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { downloads += 1; return realCreate(blob); };
    await env.desktopCreate.click(); await settle(30);
    assert.ok(backdrop(), 'Create Map opens without directory APIs');
    assert.equal(textOf(backdrop()).includes('Create Orbit'), false);
    const choose = button(backdrop(), 'Choose save location'); assert.ok(choose); assert.equal(choose.disabled, true);
    assert.match(textOf(backdrop()), /Folder-based saving is not available in this browser/);
    assert.equal(button(backdrop(), 'Save elsewhere…').disabled, false);
    const title = findAll(backdrop(), 'input').find((input) => input.type === 'text'); title.value = 'Download Only'; await title.dispatch('input'); await settle(40);
    await button(backdrop(), 'Create Map').click();
    assert.equal(await waitFor(() => env.doc.querySelector('#shell-status').textContent.match(/Download started|cannot confirm/i)), true);
    assert.equal(downloads, 1, 'explicit standalone download handoff');
    assert.match(env.doc.querySelector('#save-state').textContent, /Unsaved|not saved/i);
    URL.createObjectURL = realCreate;
    clearTimeout(watch); writeLifecycleMarker('CREATE_LOCATION_UNSUPPORTED_COMPLETE'); console.log('CREATE_LOCATION_UNSUPPORTED_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.CREATE_LOCATION_STALE) {
    const watch = setTimeout(() => { writeLifecycleMarker('CREATE_LOCATION_STALE_WATCHDOG'); console.error('CREATE_LOCATION_STALE_WATCHDOG'); process.exit(70); }, 15000); watch.unref?.();
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const backdrop = () => env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    const button = (root, label) => findAll(root, 'button').find((entry) => entry.textContent === label);
    let release; let started; const startedPromise = new Promise((resolve) => { started = resolve; });
    globalThis.window.showDirectoryPicker = async () => { started(); return new Promise((resolve) => { release = resolve; }).then(() => fixtures.directory); };
    await env.desktopCreate.click(); await settle(20);
    const title = findAll(backdrop(), 'input').find((input) => input.type === 'text'); title.value = 'Stale Location'; await title.dispatch('input'); await settle(30);
    const picking = button(backdrop(), 'Choose save location').click(); await startedPromise;
    await button(backdrop(), 'Cancel').click(); await settle(30);
    assert.equal(Boolean(backdrop()), false, 'cancel closes the creation form');
    release();
    await picking;
    await settle(200);
    assert.equal(Boolean(backdrop()), false, 'late folder completion does not reopen the form');
    assert.equal(env.doc.querySelector('#orbit-name').textContent, 'No Orbit', 'late folder completion does not adopt an Orbit after cancel');
    clearTimeout(watch); writeLifecycleMarker('CREATE_LOCATION_STALE_COMPLETE'); console.log('CREATE_LOCATION_STALE_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.CREATE_LOCATION) {
    const watch = setTimeout(() => { writeLifecycleMarker('CREATE_LOCATION_WATCHDOG'); console.error('CREATE_LOCATION_WATCHDOG'); process.exit(70); }, 20000); watch.unref?.();
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__; const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const backdrop = () => env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false);
    const button = (root, label) => findAll(root, 'button').find((entry) => entry.textContent === label);
    let dirCalls = 0; const originalDir = globalThis.window.showDirectoryPicker;
    globalThis.window.showDirectoryPicker = async (...args) => { dirCalls += 1; return originalDir(...args); };
    let saveCalls = 0; const originalSave = globalThis.window.showSaveFilePicker;
    globalThis.window.showSaveFilePicker = async (...args) => { saveCalls += 1; return originalSave(...args); };

    await env.desktopCreate.click(); await settle(30);
    assert.ok(backdrop(), 'Create Map opens directly');
    assert.equal(Boolean(env.overlayHost.children.find((child) => child.className === 'orbit-choice-backdrop')), false, 'no preliminary destination choice');
    assert.equal(textOf(backdrop()).includes('Create Orbit'), false, 'no Create Orbit tab/form');
    const titleInput = findAll(backdrop(), 'input').find((input) => input.type === 'text'); assert.ok(titleInput); assert.equal(env.doc.activeElement, titleInput, 'title field is focused immediately');
    assert.equal(button(backdrop(), 'Choose save location').disabled, false);
    assert.equal(button(backdrop(), 'Save elsewhere…').disabled, false);
    titleInput.value = 'Location Map'; await titleInput.dispatch('input'); await settle(30);
    const fileInput = findAll(backdrop(), 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
    fileInput.files = [syntheticFile('loc.txt', 'text/plain', 'location-bytes')]; await fileInput.dispatch('change');
    assert.equal(await waitFor(() => button(backdrop(), 'Create Map')?.disabled === false), true);

    globalThis.__M5_ORBIT_PICK__ = 'cancel';
    await button(backdrop(), 'Choose save location').click(); await settle(180);
    assert.equal(backdrop().hidden, false, 'picker cancel keeps Create Map open');
    assert.equal(titleInput.value, 'Location Map', 'picker cancel preserves title');
    assert.equal(textOf(backdrop()).includes('loc.txt'), true, 'picker cancel preserves optional selections');
    assert.match(textOf(backdrop()), /Location selection cancelled\. Your map details were kept\./);
    assert.equal(hooks.snapshot().hasMap, false);
    assert.equal(dirCalls, 1);

    globalThis.__M5_ORBIT_PICK__ = 'directory'; globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory;
    await button(backdrop(), 'Choose save location').click();
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
    assert.equal(backdrop().hidden, false, 'folder selection keeps Create Map open');
    assert.equal(titleInput.value, 'Location Map', 'folder selection preserves title');
    assert.equal(textOf(backdrop()).includes('loc.txt'), true, 'folder selection preserves optional selections');
    assert.equal(hooks.snapshot().hasMap, false, 'folder selection alone creates no map');
    assert.equal(dirCalls, 2);
    assert.equal(button(backdrop(), 'Change save location').disabled, false);
    assert.equal(textOf(backdrop()).includes('New maps will be saved in this folder.'), true);
    assert.match(textOf(backdrop()), /Save location selected: Orbit Alpha\./);
    assert.equal(textOf(backdrop()).includes('Orbit Alpha'), true);

    await button(backdrop(), 'Create Map').click();
    if (button(backdrop(), 'Replace map')) await button(backdrop(), 'Replace map').click();
    assert.equal(await waitFor(() => hooks.documentState().name === 'Location Map.orbit' && hooks.documentState().origin === 'orbit'), true);
    assert.deepEqual(Array.from(await hooks.attachmentBytes('loc.txt')), Array.from(new TextEncoder().encode('location-bytes')));
    assert.equal(hooks.snapshot().dirty, false);
    const firstEntry = fixtures.directory.entries.find((entry) => entry.name === 'Location Map.orbit'); assert.ok(firstEntry);
    const firstDecoded = await hooks.decodeDocument(await firstEntry.getFile()); assert.equal(firstDecoded.tree.children.length, 1); assert.deepEqual(firstDecoded.attachments[0].bytes, Array.from(new TextEncoder().encode('location-bytes')));

    assert.equal(await waitFor(() => !backdrop()), true, 'first creation closes the dialog');
    assert.equal(await waitFor(() => env.desktopCreate.disabled === false && !hooks.documentSaveState().saving), true, 'Create Map control is settled before second open');
    await env.desktopCreate.click();
    assert.equal(await waitFor(() => Boolean(backdrop())), true, 'second Create Map opens directly');
    assert.equal(button(backdrop(), 'Change save location').disabled, false, 'connected Orbit is the default location');
    assert.equal(textOf(backdrop()).includes('Orbit Alpha'), true);
    const secondTitle = findAll(backdrop(), 'input').find((input) => input.type === 'text'); secondTitle.value = 'Title Only'; await secondTitle.dispatch('input'); await settle(30);
    const beforeDir = dirCalls; const beforeSave = saveCalls;
    await button(backdrop(), 'Create Map').click();
    if (button(backdrop(), 'Replace map')) await button(backdrop(), 'Replace map').click();
    assert.equal(await waitFor(() => hooks.documentState().name === 'Title Only.orbit' && hooks.documentState().origin === 'orbit'), true);
    assert.deepEqual(hooks.treeSnapshot().children, []);
    assert.equal(hooks.attachmentSnapshot().size, 0);
    assert.equal(dirCalls, beforeDir, 'subsequent creation reuses connected folder without a directory picker');
    assert.equal(saveCalls, beforeSave, 'Orbit creation does not invoke a save picker');
    const titleEntry = fixtures.directory.entries.find((entry) => entry.name === 'Title Only.orbit'); assert.ok(titleEntry); assert.equal(titleEntry.createWritableCalls, 1);

    assert.equal(await waitFor(() => !backdrop()), true, 'second creation closes the dialog');
    assert.equal(await waitFor(() => env.desktopCreate.disabled === false && !hooks.documentSaveState().saving), true, 'Create Map control is settled before third open');
    await env.desktopCreate.click();
    assert.equal(await waitFor(() => Boolean(backdrop())), true, 'third Create Map opens directly');
    await button(backdrop(), 'Save elsewhere…').click(); await settle(20);
    assert.equal(textOf(backdrop()).includes('Standalone file'), true);
    const standaloneTitle = findAll(backdrop(), 'input').find((input) => input.type === 'text'); standaloneTitle.value = 'Standalone Map'; await standaloneTitle.dispatch('input'); await settle(30);
    await button(backdrop(), 'Create Map').click();
    if (button(backdrop(), 'Replace map')) await button(backdrop(), 'Replace map').click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.copyHandle && hooks.documentState().origin === 'file'), true);
    assert.equal(hooks.treeSnapshot().name, 'Standalone Map');
    assert.ok(saveCalls > beforeSave, 'Save elsewhere uses the standalone save picker');
    assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Orbit Alpha', 'standalone creation preserves connected Orbit');

    assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Orbit Alpha');
    assert.ok(findAll(env.doc.body, 'button').some((button) => button.dataset.openKind === 'folder'), 'Orbit Folder remains in the Open Orbit submenu');
    clearTimeout(watch); writeLifecycleMarker('CREATE_LOCATION_COMPLETE'); console.log('CREATE_LOCATION_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_ONLY) {
    const watch = setTimeout(() => { writeLifecycleMarker('ORBIT_ONLY_WATCHDOG'); console.error('ORBIT_ONLY_WATCHDOG'); process.exit(70); }, 20000); watch.unref?.();
    const settle = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    await fixtures.directory.getFileHandle('legacy.map', { create: true });
    await fixtures.directory.getFileHandle('legacy.fileorbit', { create: true });
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory; globalThis.__M5_ORBIT_PICK__ = 'directory';
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
    const orbitList = env.doc.querySelector('#orbit-list'); assert.ok(orbitList);
    assert.equal(await waitFor(() => findAll(orbitList, 'button').length > 0), true);
    const names = findAll(orbitList, 'button').map((button) => textOf(button));
    assert.equal(names.some((name) => name.includes('alpha.orbit')), true, JSON.stringify(names)); assert.equal(names.some((name) => name.includes('legacy.map')), false); assert.equal(names.some((name) => name.includes('legacy.fileorbit')), false);
    const alphaPicker = makeFakeOrbitFile('alpha.orbit', fixtures.packageBytes, { lastModified: 400 });
    globalThis.window.showOpenFilePicker = async () => [alphaPicker];
    await openViaFileChoice(env, 'Open map file'); assert.equal(await waitFor(() => hooks.documentState().handleName === 'alpha.orbit'), true);
    assert.equal(await waitFor(() => { const state = hooks.openState(); return !state.persistenceBusy && !state.pendingImport && !state.installingImport && hooks.documentState().baseline?.verification?.reason === 'post-open-verification'; }), true, 'alpha open and baseline verification settle before legacy rejection attempts');
    const tree = JSON.stringify(hooks.treeSnapshot()); const bytes = Array.from(await hooks.attachmentBytes('alpha.txt'));
    const openedDocument = hooks.documentState(); const openedDirty = hooks.snapshot().dirty; const openedHistory = hooks.historyState();
    for (const oldName of ['legacy.map', 'legacy.fileorbit']) {
      const legacyPicker = makeFakeOrbitFile(oldName, fixtures.packageBytes, { lastModified: 401 });
      globalThis.window.showOpenFilePicker = async () => [legacyPicker];
      await openViaFileChoice(env, 'Open map file'); await settle(120);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Only \.orbit files are supported/);
      assert.equal(hooks.documentState().handleName, 'alpha.orbit'); assert.equal(hooks.documentState().handle, openedDocument.handle); assert.equal(hooks.documentState().origin, openedDocument.origin); assert.equal(hooks.snapshot().dirty, openedDirty); assert.deepEqual(hooks.historyState(), openedHistory); assert.equal(JSON.stringify(hooks.treeSnapshot()), tree); assert.deepEqual(Array.from(await hooks.attachmentBytes('alpha.txt')), bytes);
    }
    const download = await hooks.startDownload(); assert.match(download.filename, /\.orbit$/);
    clearTimeout(watch); writeLifecycleMarker('ORBIT_ONLY_COMPLETE'); console.log('ORBIT_ONLY_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.COPY_MAP_ENCODE) {
    const mode = String(process.env.COPY_MAP_ENCODE_MODE || 'session');
    const watch = setTimeout(() => { writeLifecycleMarker('COPY_MAP_ENCODE_WATCHDOG'); console.error('COPY_MAP_ENCODE_WATCHDOG'); process.exit(70); }, 55000); watch.unref?.();
    const settle = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    globalThis.window.showOpenFilePicker = async () => [fixtures.standaloneHandle];
    await openViaFileChoice(env, 'Open map file'); assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle, 30000), true);
    assert.equal(await waitFor(() => hooks.documentState().baseline?.verification != null, 30000), true, 'post-open verification completed before copy snapshot');
    const source = { handle: hooks.documentState().handle, tree: JSON.stringify(hooks.treeSnapshot()), bytes: Array.from(await hooks.attachmentBytes('beta.txt')), dirty: hooks.snapshot().dirty, saved: hooks.documentState().savedRevision, baseline: JSON.stringify(hooks.documentState().baseline), attachments: hooks.attachmentSnapshot().size };
    hooks.deferNextCopyEncode();
    const destinationBefore = fixtures.emptyDirectory.entries.length;
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory; globalThis.__M5_ORBIT_PICK__ = 'directory';
    assert.equal(await waitFor(() => !env.doc.querySelector('#copy-map').disabled), true, 'Copy Map is ready after direct Open');
    const clicking = env.doc.querySelector('#copy-map').click();
    assert.equal(await waitFor(() => hooks.copyEncodeStarted(), 30000), true, 'deferred encoding started');
    let replacement = null; let replacementStatus = null;
    if (mode === 'session' || mode === 'success') {
      globalThis.window.showOpenFilePicker = async () => [fixtures.mapHandle];
      await openViaFileChoice(env, 'Open map file');
      assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle), true);
      if (mode === 'session') { hooks.replaceSession(); await settle(20); }
      replacementStatus = env.doc.querySelector('#shell-status').textContent;
      if (mode === 'session') assert.equal(replacementStatus, 'NEW SESSION');
      replacement = { handle: hooks.documentState().handle, tree: JSON.stringify(hooks.treeSnapshot()), dirty: hooks.snapshot().dirty, saved: hooks.documentState().savedRevision, baseline: JSON.stringify(hooks.documentState().baseline), attachments: hooks.attachmentSnapshot().size };
    } else if (mode === 'destroy') {
      hooks.destroyMain();
    }
    if (mode === 'success') hooks.releaseCopyEncode(); else hooks.failCopyEncode();
    await clicking; await settle(140);
    const status = env.doc.querySelector('#shell-status').textContent;
    assert.equal(fixtures.emptyDirectory.entries.some((entry) => entry.name === 'alpha-copy.orbit'), false, 'no destination after deferred encoding invalidation');
    assert.equal(fixtures.emptyDirectory.entries.length, destinationBefore, 'no writer or destination entry starts after invalidation');
    if (mode === 'current') {
      assert.match(status, /Copy Map could not prepare the copy/);
      assert.equal(hooks.documentState().handle, source.handle);
      assert.equal(JSON.stringify(hooks.treeSnapshot()), source.tree);
      assert.deepEqual(Array.from(await hooks.attachmentBytes('beta.txt')), source.bytes);
      assert.equal(hooks.snapshot().dirty, source.dirty);
      assert.equal(hooks.documentState().savedRevision, source.saved);
      assert.equal(JSON.stringify(hooks.documentState().baseline), source.baseline);
      assert.equal(hooks.attachmentSnapshot().size, source.attachments);
    } else if (mode === 'destroy') {
      assert.equal(hooks.documentSaveState().destroying, true);
      assert.doesNotMatch(status, /Copy Map could not prepare the copy/);
    } else {
      assert.equal(status, replacementStatus, 'stale encoding completion leaves replacement feedback exactly unchanged');
      assert.doesNotMatch(status, /Copy Map could not prepare the copy|Map copied/);
      assert.equal(hooks.documentState().handle, replacement.handle);
      assert.equal(JSON.stringify(hooks.treeSnapshot()), replacement.tree);
      assert.equal(hooks.snapshot().dirty, replacement.dirty);
      assert.equal(hooks.documentState().savedRevision, replacement.saved);
      assert.equal(JSON.stringify(hooks.documentState().baseline), replacement.baseline);
      assert.equal(hooks.attachmentSnapshot().size, replacement.attachments);
    }
    assert.equal(hooks.attachmentSnapshot().size, mode === 'destroy' ? 0 : (mode === 'current' ? source.attachments : replacement.attachments), 'temporary registry release does not disturb the active registry');
    clearTimeout(watch); writeLifecycleMarker('COPY_MAP_ENCODE_' + mode.toUpperCase() + '_COMPLETE'); console.log('COPY_MAP_ENCODE_' + mode.toUpperCase() + '_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.COPY_MAP_STALE) {
    const watch = setTimeout(() => { writeLifecycleMarker('COPY_MAP_STALE_WATCHDOG'); console.error('COPY_MAP_STALE_WATCHDOG'); process.exit(70); }, 20000); watch.unref?.();
    const settle = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory; globalThis.__M5_ORBIT_PICK__ = 'directory';
    await openViaFileChoice(env, 'Open Orbit'); await settle(80); const ob = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false); if (ob) await findAll(ob, 'button').find((button) => button.textContent === 'Close').click();
    globalThis.window.showOpenFilePicker = async () => [fixtures.standaloneHandle];
    await openViaFileChoice(env, 'Open map file'); assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
    const gate = {}; gate.promise = new Promise((resolve) => { gate.resolve = resolve; }); const started = {}; started.promise = new Promise((resolve) => { started.resolve = resolve; });
    globalThis.window.showDirectoryPicker = async () => { started.resolve(); return gate.promise; };
    assert.equal(await waitFor(() => !env.doc.querySelector('#copy-map').disabled), true, 'Copy Map is ready after direct Open');
    const clicking = env.doc.querySelector('#copy-map').click(); await started.promise;
    hooks.replaceSession(); await settle(20);
    gate.resolve(fixtures.directory); await clicking; await settle(120);
    assert.doesNotMatch(env.doc.querySelector('#shell-status').textContent, /Map copied/);
    assert.equal(fixtures.directory.entries.some((entry) => entry.name === 'alpha-copy.orbit'), false, 'stale picker creates no destination');
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle);
    clearTimeout(watch); writeLifecycleMarker('COPY_MAP_STALE_COMPLETE'); console.log('COPY_MAP_STALE_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.COPY_MAP_UNSUPPORTED) {
    const watch = setTimeout(() => { writeLifecycleMarker('COPY_MAP_UNSUPPORTED_WATCHDOG'); console.error('COPY_MAP_UNSUPPORTED_WATCHDOG'); process.exit(70); }, 15000); watch.unref?.();
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__; globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    await env.desktopCreate.click(); await settle(30);
    const dialog = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop' && child.hidden === false); assert.ok(dialog);
    const input = findAll(dialog, 'input').find((node) => node.type === 'text'); input.value = 'Unsupported Copy'; await input.dispatch('input'); await settle(30);
    await findAll(dialog, 'button').find((node) => node.textContent === 'Create Map').click();
    assert.equal(await waitFor(() => hooks.snapshot().hasMap), true);
    const copy = env.doc.querySelector('#copy-map'); assert.equal(copy.disabled, false);
    await copy.click(); await settle(60);
    assert.match(env.doc.querySelector('#shell-status').textContent, /Folder copy is not available/i);
    assert.equal(hooks.snapshot().dirty, true);
    clearTimeout(watch); writeLifecycleMarker('COPY_MAP_UNSUPPORTED_COMPLETE'); console.log('COPY_MAP_UNSUPPORTED_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.COPY_MAP) {
    const watch = setTimeout(() => { writeLifecycleMarker('COPY_MAP_WATCHDOG'); console.error('COPY_MAP_WATCHDOG'); process.exit(70); }, 20000); watch.unref?.();
    const settle = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const copy = env.doc.querySelector('#copy-map'); const status = () => env.doc.querySelector('#shell-status').textContent;
    const browser = () => env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    assert.equal(copy.disabled, true, 'Copy Map disabled without a map');
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory; globalThis.__M5_ORBIT_PICK__ = 'directory';
    await openViaFileChoice(env, 'Open Orbit'); assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Empty Orbit'), true);
    const ob = browser(); if (ob) await findAll(ob, 'button').find((button) => button.textContent === 'Close').click();
    globalThis.window.showOpenFilePicker = async () => [fixtures.standaloneHandle];
    await openViaFileChoice(env, 'Open map file'); assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
    assert.equal(await waitFor(() => copy.disabled === false), true, 'Copy Map is ready after direct Open'); assert.equal(copy.getAttribute('aria-label'), 'Copy Map'); assert.equal(copy.title, 'Copy Map');
    const source = { handle: hooks.documentState().handle, tree: JSON.stringify(hooks.treeSnapshot()), bytes: Array.from(await hooks.attachmentBytes('beta.txt')), dirty: hooks.snapshot().dirty, saved: hooks.documentState().savedRevision, baseline: JSON.stringify(hooks.documentState().baseline), history: JSON.stringify(hooks.historyState()), recovery: JSON.stringify(hooks.recoveryState()), orbit: env.doc.querySelector('#orbit-name').textContent };
    const writesBefore = fixtures.directory.entries.length;
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory; globalThis.__M5_ORBIT_PICK__ = 'directory';
    await copy.click();
    assert.equal(await waitFor(() => /Map copied to Orbit Alpha\./.test(status())), true, status());
    const copied = fixtures.directory.entries.find((entry) => entry.name === 'alpha-copy.orbit'); assert.ok(copied);
    const decoded = await hooks.decodeDocument(await copied.getFile()); assert.equal(decoded.tree.id, 'orbit-beta'); assert.deepEqual(decoded.attachments[0].bytes, Array.from(new TextEncoder().encode('beta-bytes')));
    assert.equal(fixtures.directory.entries.length, writesBefore + 1);
    assert.equal(hooks.documentState().handle, source.handle); assert.equal(JSON.stringify(hooks.treeSnapshot()), source.tree); assert.deepEqual(Array.from(await hooks.attachmentBytes('beta.txt')), source.bytes); assert.equal(hooks.snapshot().dirty, source.dirty); assert.equal(hooks.documentState().savedRevision, source.saved); assert.equal(JSON.stringify(hooks.documentState().baseline), source.baseline); assert.equal(JSON.stringify(hooks.historyState()), source.history); assert.equal(JSON.stringify(hooks.recoveryState()), source.recovery); assert.equal(env.doc.querySelector('#orbit-name').textContent, source.orbit);
    assert.equal(textOf(env.doc.querySelector('#orbit-list')).includes('alpha-copy.orbit'), false, 'different destination does not refresh connected Orbit list');

    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory; await copy.click();
    assert.equal(await waitFor(() => /Map copied to Empty Orbit\./.test(status())), true, status());
    assert.equal(await waitFor(() => textOf(env.doc.querySelector('#orbit-list')).includes('alpha-copy.orbit')), true, 'destination matching connected Orbit refreshes the list');
    assert.equal(hooks.documentState().handle, source.handle);
    const connectedCopied = fixtures.emptyDirectory.entries.find((entry) => entry.name === 'alpha-copy.orbit'); assert.ok(connectedCopied); const connectedBytes = Uint8Array.from(connectedCopied.bytes);
    await copy.click();
    assert.equal(await waitFor(() => /already exists/i.test(status())), true, 'same-folder collision is explicit');
    connectedCopied.replace(new Uint8Array(0), 300);
    await copy.click();
    assert.equal(await waitFor(() => /already exists/i.test(status())), true, 'zero-byte collision is explicit');
    assert.equal((await connectedCopied.getFile()).size, 0, 'zero-byte destination remains untouched');
    assert.equal(await waitFor(() => !copy.disabled), true, 'copy control settles after collision');
    globalThis.window.__M5_P1B_TEST__.clearShellStatusForTest();
    globalThis.__M5_ORBIT_PICK__ = 'cancel'; await copy.click(); await settle(120);

    assert.match(status(), /Copy cancelled/i); assert.equal(hooks.documentState().handle, source.handle);
    assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine', 'Copy picker cancellation is nonvisual routine feedback');
    globalThis.__M5_ORBIT_PICK__ = 'deny'; await copy.click(); await settle(120);
    assert.match(status(), /Folder access was not granted/i); assert.equal(hooks.documentState().handle, source.handle);
    assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'actionable', 'Copy permission failure remains visible');
    globalThis.__M5_ORBIT_PICK__ = 'directory';
    await fixtures.emptyDirectory.removeEntry('alpha-copy.orbit');
    const copyWarning = 'Recovery durability warning: keep this tab open.';
    hooks.setShellStatusForTest(copyWarning, { kind: 'actionable' });
    await copy.click();
    assert.equal(await waitFor(() => fixtures.emptyDirectory.entries.some((entry) => entry.name === 'alpha-copy.orbit')), true, 'copy still completes while critical feedback is visible');
    assert.equal(hooks.shellStatusState().message, copyWarning, 'unrelated Copy completion preserves critical feedback');
    assert.equal(hooks.shellStatusState().timer, false);
    hooks.clearShellStatusForTest();


    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory;
    await openViaFileChoice(env, 'Open Orbit'); await settle(100);
    const dirBrowser = browser(); if (dirBrowser) await findAll(dirBrowser, 'button').find((button) => button.textContent === 'Close').click();
    await findAll(env.doc.querySelector('#orbit-list'), 'button').find((button) => textOf(button).includes('alpha.orbit')).click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle), true);
    const originalBytes = Uint8Array.from(fixtures.mapHandle.bytes);
    await copy.click(); assert.equal(await waitFor(() => /already exists/i.test(status())), true, 'original destination collision is explicit');
    assert.deepEqual(Uint8Array.from(fixtures.mapHandle.bytes), originalBytes, 'original file is not overwritten');

    hooks.openDraft(); await settle(20); assert.equal(hooks.editorState().formHidden, false, 'editor draft is open');
    assert.equal(copy.disabled, true, 'editor draft blocks copy');
    const draftForm = env.doc.querySelector('#editor-form'); await findAll(draftForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);
    assert.equal(copy.disabled, false);
    clearTimeout(watch); writeLifecycleMarker('COPY_MAP_COMPLETE'); console.log('COPY_MAP_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_MENU) {
    const menuWatchdog = setTimeout(() => { writeLifecycleMarker('ORBIT_MENU_WATCHDOG'); console.error('ORBIT_MENU_WATCHDOG'); process.exit(70); }, 20000); menuWatchdog.unref?.();
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const hooks = globalThis.window.__M5_P1B_TEST__; const fixtures = globalThis.__M5_ORBIT_FIXTURES__; const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const toggle = () => env.doc.querySelector('#orbit-toggle'); const panel = () => env.doc.querySelector('#orbit-panel'); const orbitList = () => env.doc.querySelector('#orbit-list');
    assert.equal(env.doc.querySelector('#orbit-section').hidden, true, 'no Orbit means no connected menu');
    assert.equal(toggle().hidden, true, 'no inert Orbit icon while disconnected');
    assert.equal(toggle().disabled, true);
    globalThis.__M5_ORBIT_PICK__ = 'directory'; globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
    const browserDialog = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
    if (browserDialog) await findAll(browserDialog, 'button').find((button) => button.textContent === 'Close').click();
    const entry = findAll(orbitList(), 'button').find((button) => textOf(button).includes('alpha.orbit')); assert.ok(entry); await entry.click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle && hooks.snapshot().dirty === false), true);
    if (env.doc.querySelector('#nav-rail').dataset.expanded !== 'true') { await env.doc.querySelector('#nav-rail-toggle').click(); await settle(30); }
    assert.equal(env.doc.querySelector('#nav-rail').dataset.expanded, 'true');
    assert.equal(env.doc.querySelector('#shell-status').dataset.feedbackKind, 'routine', 'sidebar Orbit-list Open settles as nonvisual routine feedback');
    assert.equal(env.doc.querySelector('#orbit-section').hidden, false);
    assert.equal(toggle().hidden, false, 'connected menu exposes toggle');
    assert.equal(toggle().disabled, false);
    assert.equal(toggle().getAttribute('aria-expanded'), 'true');
    assert.equal(toggle().getAttribute('aria-controls'), 'orbit-panel');
    assert.equal(toggle().getAttribute('aria-label'), 'Orbit: Orbit Alpha');
    assert.equal(toggle().title, 'Orbit: Orbit Alpha');
    assert.equal(env.doc.querySelector('#orbit-name').textContent, 'Orbit Alpha');
    assert.equal(panel().hidden, false);
    const panelOrder = [...panel().children].map((child) => child.id).filter(Boolean);
    assert.ok(panelOrder.indexOf('orbit-empty') < panelOrder.indexOf('orbit-list') && panelOrder.indexOf('orbit-list') < panelOrder.indexOf('orbit-status'), 'status follows empty/list in DOM order');
    assert.equal(await waitFor(() => findAll(orbitList(), 'button').some((button) => button.getAttribute('aria-current') === 'true')), true, 'current map marker');
    assert.equal(env.doc.querySelector('#orbit-refresh').disabled, false);
    await toggle().click(); await settle(30);
    assert.equal(panel().hidden, true, 'toggle collapses list');
    assert.equal(toggle().getAttribute('aria-expanded'), 'false');
    await toggle().click(); await settle(30);
    assert.equal(panel().hidden, false, 'toggle expands list');
    assert.equal(toggle().getAttribute('aria-expanded'), 'true');

    hooks.openDraft(); await settle(20);
    const draftForm = env.doc.querySelector('#editor-form'); assert.equal(draftForm.hidden, false);
    const draftInput = findAll(draftForm, 'input').find((input) => input.type === 'text'); draftInput.value = 'Orbit menu draft'; await draftInput.dispatch('input'); draftInput.focus(); if (draftInput.setSelectionRange) draftInput.setSelectionRange(2, 6);
    const draftIdentity = draftInput; const draftSelection = [draftInput.selectionStart, draftInput.selectionEnd];
    const railToggle = env.doc.querySelector('#nav-rail-toggle'); await railToggle.click(); await settle(30); await railToggle.click(); await settle(30);
    assert.equal(hooks.editorState().input, draftIdentity);
    assert.equal(hooks.editorState().value, 'Orbit menu draft');
    assert.equal(env.doc.activeElement, draftInput, 'editor focus survives rail expansion');
    assert.deepEqual([draftInput.selectionStart, draftInput.selectionEnd], draftSelection, 'editor selection survives rail expansion');
    await findAll(draftForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30);

    hooks.touch(); await settle(20);
    await findAll(orbitList(), 'button').find((button) => textOf(button).includes('alpha.orbit')).click();
    const dirtyPrompt = await waitFor(() => env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false));
    assert.equal(dirtyPrompt, true);
    const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
    await findAll(prompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30);
    assert.equal(hooks.documentState().handle, fixtures.mapHandle, 'dirty replacement Cancel preserves map');
    assert.equal(hooks.snapshot().dirty, true);

    assert.equal(env.doc.querySelector('#orbit-close'), null, 'sidebar has no close action');
    assert.equal(env.doc.querySelector('#orbit-section').hidden, false, 'Orbit remains connected without a sidebar close action');
    clearTimeout(menuWatchdog); writeLifecycleMarker('ORBIT_MENU_COMPLETE'); console.log('ORBIT_MENU_COMPLETE');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.OPEN_WORKFLOW) {
    globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__;
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    let filePicks = 0; let folderPicks = 0;
    globalThis.window.showOpenFilePicker = async () => { filePicks += 1; return [fixtures.standaloneHandle]; };
    globalThis.window.showDirectoryPicker = async () => { folderPicks += 1; return fixtures.directory; };
    const nav = env.doc.querySelector('#nav-rail');
    const openAction = env.doc.querySelector('#open-orbit-action');
    const menu = () => env.doc.querySelector('#open-orbit-menu');
    const choice = (kind) => findAll(env.doc.body, 'button').find((button) => button.dataset.openKind === kind);
    const openSubmenu = async () => { if (menu().hidden) await openAction.click(); };
    const select = async (kind) => {
      await openSubmenu(); const item = choice(kind); assert.ok(item, kind + ' submenu choice'); await item.click();
      if (kind === 'folder') {
        const terminal = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
        if (terminal) {
          const choose = findAll(terminal, 'button').find((button) => button.dataset.openBrowser === 'choose-folder');
          if (choose && !choose.disabled) {
            await choose.click();
            const end = Date.now() + 5000;
            while (Date.now() < end) {
              const current = env.overlayHost.children.find((child) => child.className === 'file-open-browser-backdrop' && child.hidden === false);
              const connect = current && findAll(current, 'button').find((button) => button.dataset.openBrowser === 'connect');
              if (connect && !connect.disabled) { await connect.click(); break; }
              await settle(25);
            }
          }
        }
      }
    };
    const dispatchDocument = (type, event = {}) => { for (const fn of env.doc.listeners.get(type) || []) fn({ type, preventDefault() {}, ...event }); };
    assert.ok(openAction && menu() && choice('file') && choice('folder'));
    await openSubmenu();
    assert.equal(menu().hidden, false);
    assert.equal(filePicks, 0, 'opening the submenu launches no file picker');
    assert.equal(folderPicks, 0, 'opening the submenu launches no folder picker');
    const keyboardBefore = env.doc.activeElement;
    menu().dispatch('keydown', { key: 'ArrowDown', preventDefault() {} });
    assert.notEqual(env.doc.activeElement, keyboardBefore, 'ArrowDown moves within the submenu');
    assert.ok([choice('file'), choice('folder')].includes(env.doc.activeElement));
    menu().dispatch('keydown', { key: 'Home', preventDefault() {} });
    assert.equal(env.doc.activeElement, choice('file'), 'Home moves to the first submenu choice');
    dispatchDocument('keydown', { key: 'Escape' });
    assert.equal(env.doc.activeElement, openAction, 'Escape restores focus to Open Orbit');
    assert.equal(menu().hidden, true, 'Escape dismisses the collapsed submenu');
    await nav.querySelector('#nav-rail-toggle').click();
    assert.equal(nav.dataset.expanded, 'true');
    await openSubmenu();
    assert.equal(menu().hidden, false, 'expanded Open Orbit submenu is available');
    assert.ok(choice('file') && choice('folder'));
    dispatchDocument('pointerdown', { target: env.doc.body });
    assert.equal(menu().hidden, true, 'outside click dismisses the expanded submenu');
    await openSubmenu();
    for (const fn of globalThis.window.listeners.get('resize') || []) fn({});
    assert.equal(menu().hidden, false, 'resize does not orphan the submenu');
    dispatchDocument('keydown', { key: 'Escape' });
    await nav.querySelector('#nav-rail-toggle').click();
    assert.equal(nav.dataset.expanded, 'false');
    assert.equal(filePicks, 0);
    assert.equal(folderPicks, 0);
    await select('file');
    assert.equal(menu().hidden, true, 'submenu closes when a choice is selected');
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.standaloneHandle), true);
    assert.equal(filePicks, 1, 'Open Orbit uses the file picker');
    assert.equal(folderPicks, 0, 'Open Orbit never uses the folder picker');
    assert.equal(hooks.treeSnapshot().name, 'Standalone Beta');
    assert.equal(hooks.documentState().mode, 'writable');
    assert.equal(hooks.documentState().origin, 'orbit');
    assert.equal(hooks.documentState().baseline?.state, 'known');
    assert.equal(await waitFor(() => hooks.documentState().baseline?.verification != null), true, 'post-open verification completed before encoding snapshot');
    const preservedDoc = hooks.documentState();
    const preservedBaseline = JSON.stringify(preservedDoc.baseline);
    const preservedTree = JSON.stringify(hooks.treeSnapshot());
    const preservedSaved = preservedDoc.savedRevision;
    const preservedWrites = fixtures.standaloneHandle.createWritableCalls;
    hooks.touch(); await settle(40);
    globalThis.__M5_SAVE_ENCODE_FAILURE__ = true;
    await env.desktopSave.click();
    const encodingFriendly = 'We couldn’t create the map file. Your changes are still in this map. Please try again.';
    assert.equal(await waitFor(() => env.doc.querySelector('#shell-status').textContent === encodingFriendly && !hooks.documentSaveState().saving), true, 'encoding failure uses friendly retained-changes feedback');
    const encodingText = env.doc.querySelector('#shell-status').textContent;
    assert.equal(encodingText, encodingFriendly);
    assert.doesNotMatch(encodingText, /encoding stage|Document save failed|AbortError|stack/i);
    const encodingFailure = hooks.documentSaveState().lastFailure;
    assert.equal(encodingFailure.stage, 'encoding');
    assert.equal(encodingFailure.reason, 'injected-save-encoding-failure');
    assert.equal(encodingFailure.code, 'injected-save-encoding-failure');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'encoding failure has no duplicate automatic-save feedback');
    assert.equal(hooks.automaticSaveState().failure, null, 'encoding failure leaves no secondary automatic-save failure');
    assert.equal(hooks.automaticSaveState().blocked, true, 'automatic save pauses after manual encoding failure');
    assert.match(encodingFailure.errorMessage, /injected document encoding failure/);
    assert.equal(encodingFailure.errorName, 'Error');
    assert.equal(hooks.snapshot().dirty, true, 'encoding failure preserves dirty edits');
    assert.equal(hooks.documentState().handle, preservedDoc.handle, 'encoding failure preserves destination handle');
    assert.equal(hooks.documentState().name, preservedDoc.name, 'encoding failure preserves document name');
    assert.equal(hooks.documentState().mode, preservedDoc.mode, 'encoding failure preserves writable mode');
    assert.equal(JSON.stringify(hooks.documentState().baseline), preservedBaseline, 'encoding failure preserves baseline');
    assert.equal(JSON.stringify(hooks.treeSnapshot()), preservedTree, 'encoding failure preserves current map');
    assert.equal(hooks.documentState().savedRevision, preservedSaved, 'encoding failure does not advance saved revision');
    assert.equal(fixtures.standaloneHandle.createWritableCalls, preservedWrites, 'encoding failure writes no destination');
    assert.equal(env.desktopSave.disabled, false, 'Save remains available after encoding failure');
    assert.equal(findAll(env.doc.body, 'button').some((button) => button.dataset.action === 'save-document-as' && !button.disabled), true, 'Save As remains available after encoding failure');
    assert.doesNotMatch(encodingText, /^Saved\b|Download started/i);
    globalThis.__M5_SAVE_ENCODE_FAILURE__ = false;
    const writesBefore = fixtures.standaloneHandle.createWritableCalls;
    hooks.touch(); await settle(30);
    await env.desktopSave.click();
    assert.equal(await waitFor(() => fixtures.standaloneHandle.createWritableCalls > writesBefore), true, 'direct open saves to its original handle');
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle);
    const writesAfterDirectSave = fixtures.standaloneHandle.createWritableCalls;
    fixtures.standaloneHandle.replace(fixtures.changedBytes, 400);
    hooks.touch(); await settle(20);
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false))), true, 'direct-open external change reaches conflict');
    const directConflict = env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false);
    await findAll(directConflict, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(80);
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'direct-open conflict Cancel preserves identity');
    assert.equal(hooks.snapshot().dirty, true, 'direct-open conflict Cancel preserves edits');
    assert.equal(fixtures.standaloneHandle.createWritableCalls, writesAfterDirectSave, 'direct-open conflict Cancel writes nothing');
    await select('folder');
    assert.equal(await waitFor(() => env.doc.querySelector('#orbit-name').textContent === 'Orbit Alpha'), true);
    assert.equal(folderPicks, 1, 'Connect Folder uses the folder picker');
    assert.equal(filePicks, 1, 'Connect Folder does not open the file picker');
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'Connect Folder preserves the current document');
    const list = env.doc.querySelector('#orbit-list');
    assert.equal(await waitFor(() => findAll(list, 'button').some((button) => textOf(button).includes('alpha.orbit'))), true);
    const alphaEntry = findAll(list, 'button').find((button) => textOf(button).includes('alpha.orbit'));
    await alphaEntry.click();
    assert.equal(await waitFor(() => Boolean(env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false))), true, 'folder file switch guards unsaved edits');
    let switchPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
    await findAll(switchPrompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(80);
    assert.equal(hooks.documentState().handle, fixtures.standaloneHandle, 'folder switch Cancel preserves standalone document');
    assert.equal(hooks.snapshot().dirty, true, 'folder switch Cancel preserves edits');
    await alphaEntry.click();
    assert.equal(await waitFor(() => Boolean(env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false))), true);
    switchPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
    await findAll(switchPrompt, 'button').find((button) => button.textContent === 'Discard changes').click();
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.mapHandle), true, 'folder file switch Discard opens the selected file');
    assert.equal(hooks.treeSnapshot().name, 'Orbit Alpha');
    const switchedHandle = hooks.documentState().handle;

    globalThis.window.showDirectoryPicker = async () => { folderPicks += 1; const error = new Error('cancelled'); error.name = 'AbortError'; throw error; };
    await select('folder'); await settle(80);
    assert.equal(hooks.documentState().handle, switchedHandle, 'folder picker cancel preserves document');
    globalThis.window.showOpenFilePicker = async () => { filePicks += 1; const error = new Error('cancelled'); error.name = 'AbortError'; throw error; };
    await select('file'); await settle(100);
    assert.equal(hooks.documentState().handle, switchedHandle, 'file picker cancel preserves document');
    globalThis.window.showOpenFilePicker = async () => { filePicks += 1; return [fixtures.invalidHandle]; };
    hooks.touch(); await settle(20);
    await select('file'); await settle(180);
    assert.equal(hooks.documentState().handle, switchedHandle, 'invalid file preserves document');
    assert.equal(hooks.snapshot().dirty, true, 'invalid file preserves edits');
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ORBIT_UI) {
    const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch {} await settle(25); } return false; };
    const hooks = globalThis.window.__M5_P1B_TEST__;
    assert.ok(hooks, 'P1B hooks are required for Orbit main tests');
    const fixtures = globalThis.__M5_ORBIT_FIXTURES__;
    const orbitName = env.doc.querySelector('#orbit-name');
    const orbitList = env.doc.querySelector('#orbit-list');
    const orbitEmpty = env.doc.querySelector('#orbit-empty');
    const orbitStatus = env.doc.querySelector('#orbit-status');
    const conflict = () => env.overlayHost.children.find((child) => child.className === 'file-conflict-backdrop' && child.hidden === false);
    const entryButton = (name) => findAll(orbitList, 'button').find((button) => textOf(button).includes(name));
    const clickConflict = async (label) => { const dialog = conflict(); assert.ok(dialog, 'conflict dialog should be visible'); await findAll(dialog, 'button').find((button) => button.textContent === label).click(); await settle(50); };

    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Orbit Alpha'), true);
    assert.equal(orbitList.children.length, 2, 'only top-level .orbit entries are listed');
    assert.equal(textOf(orbitList).includes('notes.txt'), false);
    assert.equal(orbitEmpty.hidden, true);

    await entryButton('alpha.orbit').click();
    assert.equal(await waitFor(() => hooks.snapshot().hasMap), true);
    assert.equal(await waitFor(() => hooks.documentState().origin === 'orbit' && hooks.documentState().baseline?.state === 'known'), true);
    const tree = hooks.treeSnapshot();
    assert.equal(tree.id, 'orbit-alpha');
    assert.equal(tree.children[0].id, 'orbit-alpha-file');
    assert.deepEqual(Array.from(await hooks.attachmentBytes('alpha.txt')), Array.from(new TextEncoder().encode('alpha-bytes')));
    assert.equal(await waitFor(() => findAll(orbitList, 'button').some((button) => button.getAttribute('aria-current') === 'true')), true, 'opened list entry is marked current');

    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => hooks.documentState().baseline?.provenance === 'confirmed-write'), true);
    assert.equal(hooks.snapshot().dirty, false);
    assert.equal(hooks.documentState().baseline.state, 'known');
    assert.equal(hooks.documentState().baseline.provenance, 'confirmed-write');

    fixtures.mapHandle.replace(fixtures.changedBytes, 200);
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    await clickConflict('Cancel');
    assert.equal(hooks.documentState().handle, fixtures.mapHandle);
    assert.equal(hooks.snapshot().dirty, true, 'cancelled save preserves dirty edits');

    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    await clickConflict('Replace Saved File');
    assert.equal(await waitFor(() => hooks.documentState().baseline?.state === 'known' && !hooks.documentSaveState().saving), true);
    assert.equal(hooks.documentState().baseline.state, 'known');

    // Editor form Save goes through the same overwrite protection.
    fixtures.mapHandle.replace(fixtures.changedBytes, 200);
    hooks.openDraft();
    const editorForm = env.doc.querySelector('#editor-form');
    const editorInput = findAll(editorForm, 'input').find((input) => input.type === 'text');
    editorInput.value = 'Alpha edited'; await editorInput.dispatch('input');
    await editorForm.dispatch('submit', { preventDefault() {} });
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'editor Save shows the external conflict');
    let pickerCalls = 0;
    const originalPickSave = globalThis.window.showSaveFilePicker;
    globalThis.window.showSaveFilePicker = async (...args) => { pickerCalls += 1; return originalPickSave ? originalPickSave(...args) : null; };
    await clickConflict('Cancel');
    assert.equal(pickerCalls, 0, 'conflict Cancel opens no save picker');
    assert.equal(Boolean(conflict()), false, 'conflict overlay is hidden after Cancel');
    assert.equal(hooks.documentSaveState().saving, false, 'editor exits Saving after conflict Cancel');
    assert.equal(env.doc.querySelector('#editor-status').textContent, 'Changes remain in this map but have not been saved.');
    assert.equal(env.doc.querySelector('#editor-error').textContent, '');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'editor cancellation does not duplicate external feedback');
    assert.doesNotMatch(env.doc.querySelector('#editor-status').textContent, /AbortError|showSaveFilePicker|stack/i);
    globalThis.window.showSaveFilePicker = originalPickSave;
    const editorAfterCancel = hooks.editorState();
    assert.equal(editorAfterCancel.formHidden, false);
    assert.equal(editorAfterCancel.dirty, true);
    assert.equal(editorAfterCancel.value, 'Alpha edited');
    const saveAsButton = findAll(editorForm, 'button').find((button) => button.textContent === 'Save As');
    assert.ok(saveAsButton, 'applied editor exposes Save As recovery');
    globalThis.__M5_ORBIT_SAVE_PICK__ = 'cancel';
    await saveAsButton.click(); await settle(120);
    assert.equal(env.doc.querySelector('#editor-status').textContent, 'Changes remain in this map but have not been saved.');
    assert.doesNotMatch(env.doc.querySelector('#editor-status').textContent, /AbortError|showSaveFilePicker|stack/i);
    assert.equal(hooks.snapshot().dirty, true);
    assert.equal(hooks.documentState().handle, fixtures.mapHandle);
    globalThis.__M5_ORBIT_SAVE_PICK__ = null;
    let retryPickerCalls = 0;
    const originalRetryPick = globalThis.window.showSaveFilePicker;
    globalThis.window.showSaveFilePicker = async (...args) => { retryPickerCalls += 1; return originalRetryPick ? originalRetryPick(...args) : null; };
    const writesBeforeRetryCancel = fixtures.mapHandle.createWritableCalls;
    const retryClick = editorForm.dispatch('submit', { preventDefault() {} });
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'Retry Save uses the same conflict protection');
    await clickConflict('Cancel');
    await retryClick;
    assert.equal(retryPickerCalls, 0, 'repeated conflict Cancel opens no save picker');
    assert.equal(fixtures.mapHandle.createWritableCalls, writesBeforeRetryCancel, 'repeated conflict Cancel performs zero destination writes');
    assert.equal(env.doc.querySelector('#editor-status').textContent, 'Changes remain in this map but have not been saved.');
    assert.equal(env.doc.querySelector('#editor-error').textContent, '');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'repeated cancellation has no duplicate fallback feedback');
    assert.doesNotMatch(env.doc.querySelector('#shell-status').textContent, /Changes applied to this map|could not be saved in this browser|AbortError/i);
    assert.equal(hooks.documentSaveState().saving, false, 'editor exits Saving after repeated conflict Cancel');
    assert.equal(hooks.snapshot().dirty, true);
    assert.equal(hooks.editorState().value, 'Alpha edited');
    assert.equal(findAll(editorForm, 'button').find((button) => button.textContent === 'Retry Save').disabled, false);
    assert.equal(findAll(editorForm, 'button').find((button) => button.textContent === 'Save As').hidden, false);
    assert.equal(findAll(editorForm, 'button').find((button) => button.textContent === 'Close').disabled, false);
    globalThis.window.showSaveFilePicker = originalRetryPick;
    const retryAgainClick = editorForm.dispatch('submit', { preventDefault() {} });
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'third Retry Save remains protected');
    await clickConflict('Cancel');
    await retryAgainClick;
    assert.equal(env.doc.querySelector('#editor-status').textContent, 'Changes remain in this map but have not been saved.');
    assert.equal(env.doc.querySelector('#editor-error').textContent, '');
    assert.equal(env.doc.querySelector('#save-feedback').hidden, true);
    assert.equal(hooks.snapshot().dirty, true);
    await findAll(editorForm, 'button').find((button) => button.textContent === 'Close').click();
    await settle(40);


    fixtures.mapHandle.replace(fixtures.changedBytes, 200);
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true);
    const pickerCallsBefore = globalThis.__M5_ORBIT_SAVE_PICK_CALLS__ || 0;
    globalThis.__M5_ORBIT_SAVE_PICK_CALLS__ = pickerCallsBefore;
    const originalPicker = globalThis.window.showSaveFilePicker;
    globalThis.window.showSaveFilePicker = async (...args) => { globalThis.__M5_ORBIT_SAVE_PICK_CALLS__ += 1; return originalPicker(...args); };
    await clickConflict('Save a Copy');
    assert.equal(await waitFor(() => hooks.documentState().handle === fixtures.copyHandle && !hooks.documentSaveState().saving), true);
    assert.equal(globalThis.__M5_ORBIT_SAVE_PICK_CALLS__, pickerCallsBefore + 1, 'Save a Copy picker must be invoked from the user click');
    assert.equal(hooks.documentState().handle, fixtures.copyHandle);
    assert.equal(hooks.documentState().baseline.state, 'known');
    const savedCopyBytes = Uint8Array.from(fixtures.copyHandle.bytes);
    const savedCopyStamp = (await fixtures.copyHandle.getFile()).lastModified;
    globalThis.window.showSaveFilePicker = originalPicker;

    // A late listed-open result cannot install after switching Orbit.
    const originalLateGet = fixtures.mapHandle.getFile;
    let resolveLateRead; let lateReadStarted;
    const lateStarted = new Promise((resolve) => { lateReadStarted = resolve; });
    fixtures.mapHandle.getFile = () => new Promise((resolve) => { lateReadStarted(); resolveLateRead = resolve; });
    const lateOpen = entryButton('alpha.orbit').click();
    await lateStarted;
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Empty Orbit'), true);
    resolveLateRead(fakeOrbitFile('alpha.orbit', fixtures.mapHandle.bytes, 200));
    await lateOpen;
    await settle(80);
    assert.equal(hooks.documentState().handle, fixtures.copyHandle, 'late listed Open after switch is ignored');
    fixtures.mapHandle.getFile = originalLateGet;

    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.emptyDirectory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Empty Orbit' && orbitEmpty.hidden === false), true);
    assert.equal(hooks.snapshot().hasMap, true, 'changing Orbit must not clear the current map');

    globalThis.__M5_ORBIT_PICK__ = 'cancel';
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => /cancelled/.test(env.doc.querySelector('#shell-status').textContent)), true);
    assert.equal(orbitName.textContent, 'Empty Orbit');
    assert.equal(hooks.snapshot().hasMap, true);
    globalThis.__M5_ORBIT_PICK__ = 'directory';
    globalThis.__M5_ORBIT_NEXT_DIRECTORY__ = fixtures.directory;
    await openViaFileChoice(env, 'Open Orbit');
    assert.equal(await waitFor(() => orbitName.textContent === 'Orbit Alpha'), true);

    await entryButton('invalid.orbit').click();
    const invalidSettled = await waitFor(() => /failed|invalid|Could not/i.test(env.doc.querySelector('#shell-status').textContent));
    assert.equal(invalidSettled, true);
    assert.equal(hooks.snapshot().hasMap, true, 'failed listed open preserves the current map');

    hooks.touch();
    await entryButton('alpha.orbit').click();
    const unsaved = () => env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
    assert.equal(await waitFor(() => Boolean(unsaved())), true);
    await findAll(unsaved(), 'button').find((button) => button.textContent === 'Cancel').click();
    assert.equal(hooks.documentState().handle, fixtures.copyHandle);
    assert.equal(hooks.snapshot().dirty, true, 'dirty replacement Cancel preserves edits');

    globalThis.__M5_ORBIT_PICK__ = 'directory';

    const originalCopyGet = fixtures.copyHandle.getFile;
    fixtures.copyHandle.getFile = async () => ({ ...fakeOrbitFile('alpha-copy.orbit', fixtures.copyHandle.bytes, 203), arrayBuffer: async () => { throw new Error('unavailable'); } });
    await env.desktopSave.click();
    const conflictShown = await waitFor(() => Boolean(conflict()));
    assert.equal(conflictShown, true);
    const unverifiable = conflict();
    assert.equal(findAll(unverifiable, 'button').find((button) => button.textContent === 'Replace Saved File').disabled, true);
    await clickConflict('Cancel');
    fixtures.copyHandle.getFile = originalCopyGet;

    assert.equal(env.doc.querySelector('#orbit-section').hidden, false, 'Orbit remains connected without a close action');
    fixtures.copyHandle.replace(fixtures.changedBytes, 204);
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => Boolean(conflict())), true, 'protection remains active with a connected Orbit');
    await clickConflict('Cancel');
    assert.equal(hooks.documentState().handle, fixtures.copyHandle);

    fixtures.copyHandle.replace(savedCopyBytes, savedCopyStamp);
    fixtures.copyHandle.__failGetAfterWrite = true;
    const revisionBeforeBaselineFailure = hooks.snapshot().savedRevision;
    hooks.touch();
    await env.desktopSave.click();
    assert.equal(await waitFor(() => /Saved;.*baseline/.test(env.doc.querySelector('#shell-status').textContent)), true);
    assert.equal(hooks.snapshot().dirty, false, 'successful file write remains successful');
    assert.ok(hooks.documentState().savedRevision > revisionBeforeBaselineFailure, 'savedRevision is not rolled back');
    assert.notEqual(hooks.documentState().baseline.state, 'known', 'baseline read failure gates the next overwrite');

    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.STAGE3J_ROUTING) {
  globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
  const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms)); const hooks = globalThis.window.__M5_P1B_TEST__;
  await env.desktopCreate.click(); const backdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop'); assert.ok(backdrop); const dialog = backdrop.children[0]; const nameInput = findAll(dialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Routing Map'; const fileInput = findAll(dialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory')); fileInput.files = [syntheticFile('note.txt', 'text/plain', 'routing')]; await fileInput.dispatch('change'); await settle(20); await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
  assert.equal(hooks.snapshot().hasMap, true);
  hooks.openDraft(); await settle(30); let form = env.doc.querySelector('#editor-form'); let input = findAll(form, 'input').find((item) => item.type === 'text'); input.value = 'Routing Edited'; await input.dispatch('input'); await form.dispatch('submit', { preventDefault() {} }); await settle(250); const closeEditor = findAll(form, 'button').find((button) => button.textContent === 'Close'); if (closeEditor) { await closeEditor.click(); await settle(120); }
  assert.equal(hooks.treeSnapshot().name, 'Routing Edited');
  for (let i = 0; i < 60 && env.doc.querySelector('#undo-history').disabled; i += 1) await settle(50); const beforeHistory = hooks.runtimeAccessStats(); await env.doc.querySelector('#undo-history').click(); for (let i = 0; i < 80 && hooks.treeSnapshot().name !== 'Routing Map'; i += 1) await settle(50); assert.equal(hooks.treeSnapshot().name, 'Routing Map', 'toolbar undo status: ' + env.doc.querySelector('#shell-status').textContent + ' / ' + JSON.stringify(hooks.historyState())); await env.doc.querySelector('#redo-history').click(); for (let i = 0; i < 80 && hooks.treeSnapshot().name !== 'Routing Edited'; i += 1) await settle(50); assert.equal(hooks.treeSnapshot().name, 'Routing Edited'); const afterHistory = hooks.runtimeAccessStats(); assert.ok(afterHistory.move >= beforeHistory.move + 2, 'toolbar undo/redo did not route through runtimeAccess.move');
  let downloadBlob = null; const originalObjectUrl = URL.createObjectURL; URL.createObjectURL = (blob) => { downloadBlob = blob; return 'blob:stage3j-routing'; }; const beforeDownload = hooks.runtimeAccessStats(); await env.doc.querySelector('#download-backup').click(); for (let i = 0; i < 80 && !downloadBlob; i += 1) await settle(50); URL.createObjectURL = originalObjectUrl;
  assert.ok(downloadBlob, 'download did not produce a blob'); const downloaded = await hooks.decodeDocument(downloadBlob); assert.equal(downloaded.tree.name, 'Routing Edited'); assert.ok(downloaded.attachments.some((entry) => entry.name === 'note.txt' && new TextDecoder().decode(new Uint8Array(entry.bytes)) === 'routing')); assert.ok(hooks.runtimeAccessStats().tree > beforeDownload.tree, 'download did not route through runtimeAccess serialization state');
  let savedBlob = null; let writes = 0; let closes = 0; const saveHandle = { name: 'routing.orbit', async createWritable() { return { async write(blob) { savedBlob = blob; writes += 1; }, async close() { closes += 1; }, async abort() {} }; } }; let pickerCalls = 0;
  globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; return saveHandle; }; globalThis.window.showOpenFilePicker = async () => [];
  for (let i = 0; i < 40 && env.doc.querySelector('[data-action="save-document-as"]').disabled; i += 1) await settle(50); const beforeSaveAs = hooks.runtimeAccessStats(); await env.doc.querySelector('[data-action="save-document-as"]').click(); for (let i = 0; i < 100 && writes === 0; i += 1) await settle(50); assert.equal(writes, 1, 'Save As did not write: ' + env.doc.querySelector('#shell-status').textContent); for (let i = 0; i < 40 && hooks.documentState().handle !== saveHandle; i += 1) await settle(50); assert.equal(hooks.documentState().handle, saveHandle, 'Save As destination not adopted'); const savedAs = await hooks.decodeDocument(savedBlob); assert.equal(savedAs.tree.name, 'Routing Edited'); assert.equal(pickerCalls, 1); assert.ok(hooks.runtimeAccessStats().tree > beforeSaveAs.tree, 'Save As did not route through runtimeAccess serialization state');
  globalThis.__M5_DISABLE_AUTOMATIC_SAVE__ = true;
  hooks.openDraft(); await settle(20); form = env.doc.querySelector('#editor-form'); input = findAll(form, 'input').find((item) => item.type === 'text'); input.value = 'Routing Saved'; await input.dispatch('input'); await form.dispatch('submit', { preventDefault() {} }); await settle(250); const closeEditor2 = findAll(form, 'button').find((button) => button.textContent === 'Close'); if (closeEditor2) { await closeEditor2.click(); await settle(120); } hooks.touch(); for (let i = 0; i < 40 && !hooks.snapshot().dirty; i += 1) await settle(50); assert.equal(hooks.snapshot().dirty, true, 'manual Save precondition is not dirty'); const writesBeforeManual = writes; const closesBeforeManual = closes; const beforeManual = hooks.runtimeAccessStats(); const bytesBeforeManual = savedBlob; for (let i = 0; i < 40 && env.doc.querySelector('[data-action="save-map"]').disabled; i += 1) await settle(50); await env.doc.querySelector('[data-action="save-map"]').click(); for (let i = 0; i < 100 && (writes !== writesBeforeManual + 1 || closes !== closesBeforeManual + 1); i += 1) await settle(50); assert.equal(writes, writesBeforeManual + 1, 'toolbar Save did not perform a new write'); assert.equal(closes, closesBeforeManual + 1, 'toolbar Save did not close the new write'); assert.ok(hooks.runtimeAccessStats().tree > beforeManual.tree, 'toolbar Save did not route through runtimeAccess serialization state'); assert.notEqual(savedBlob, bytesBeforeManual, 'toolbar Save did not replace the package bytes'); const savedCurrent = await hooks.decodeDocument(savedBlob); assert.equal(savedCurrent.tree.name, 'Routing Saved'); assert.equal(savedCurrent.attachments[0].name, 'note.txt'); assert.equal(hooks.snapshot().dirty, false, 'toolbar Save did not clear dirty'); assert.equal(hooks.documentState().handle, saveHandle);
  hooks.touch(); for (let i = 0; i < 40 && !hooks.snapshot().dirty; i += 1) await settle(50); const identity = hooks.documentState(); const dirtyBeforeCancel = hooks.snapshot().dirty; const bytesBeforeCancel = savedBlob; assert.equal(dirtyBeforeCancel, true, 'Save As cancellation precondition is not dirty'); const pickerCallsBeforeCancel = pickerCalls; globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }; await env.doc.querySelector('[data-action="save-document-as"]').click(); for (let i = 0; i < 40 && pickerCalls === pickerCallsBeforeCancel; i += 1) await settle(50); assert.equal(pickerCalls, pickerCallsBeforeCancel + 1, 'Save As cancellation picker was not invoked'); await settle(200); assert.equal(hooks.documentState().handle, identity.handle); assert.equal(hooks.documentState().documentIdentity, identity.documentIdentity); assert.equal(hooks.snapshot().dirty, true, 'cancelled Save As cleared dirty'); assert.equal(savedBlob, bytesBeforeCancel, 'cancelled Save As rewrote bytes');
  delete globalThis.window.showSaveFilePicker; delete globalThis.window.showOpenFilePicker; delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  return;
}
if (process.env.P1B) {
    const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
    await env.desktopCreate.click();
    const createBackdrop = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop');
    assert.ok(createBackdrop); const createDialog = createBackdrop.children[0];
    const nameInput = findAll(createDialog, 'input').find((input) => input.type === 'text'); nameInput.value = 'Browser Map'; await nameInput.dispatch('input'); await settle(30);
    const p1bLibrary = makeFakeOrbitDirectory('P1B Library', []);
    const addedLibrary = await globalThis.window.__M5_P1B_TEST__.addMapLibraryForTest(p1bLibrary, 'P1B Library');
    assert.equal(addedLibrary.ok, true, 'P1B Library could not be adopted');
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Refresh').click();
    for (let i = 0; i < 40 && !findAll(createDialog, 'button').find((button) => button.textContent === 'P1B Library'); i += 1) await settle(50);
    await findAll(createDialog, 'button').find((button) => button.textContent === 'P1B Library').click();
    await findAll(createDialog, 'button').find((button) => button.textContent === 'Create Map').click(); await settle(300);
assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.hasMap, true);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 1, 'Create Map must produce exactly one root');
    const fixturePackage = await makeSyntheticPackage({ rootId: 'p1b-browser', rootName: 'Browser Map', fileName: 'note.txt', bytes: new TextEncoder().encode('hello'), text: 'Browser Map' });
    await globalThis.window.__M5_P1B_TEST__.importPackage(fixturePackage); await settle(250);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2, 'P1B fixture note was not installed');
    assert.ok(env.doc.querySelector('#label-host').children.length > 0);
    if (process.env.P1B_UNLOAD) {
      const dirtyEvent = { preventDefault() { this.prevented = true; }, returnValue: '' };
      for (const fn of globalThis.window.listeners.get('beforeunload') || []) fn(dirtyEvent);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 1);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount >= 2);
      assert.equal(dirtyEvent.prevented, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 1);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount >= 2);
      assert.equal(env.doc.querySelector('#graph-host').hidden, false);
      await env.desktopSave.click(); await settle(160);
      globalThis.window.__M5_P1B_TEST__.openDraft(); await settle(30);
      const draftForm = env.doc.querySelector('#editor-form');
      const draftInput = findAll(draftForm, 'input').find((input) => input.type === 'text'); draftInput.value = 'draft-in-progress'; await draftInput.dispatch('input'); await settle(20);
      const draftEvent = { preventDefault() { this.prevented = true; }, returnValue: '' };
      for (const fn of globalThis.window.listeners.get('beforeunload') || []) fn(draftEvent);
      assert.equal(draftEvent.prevented, true);
      assert.equal(draftInput.value, 'draft-in-progress');
      await findAll(draftForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_ADD_AFTER_CREATE) {
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(40);
      const addMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      assert.ok(addMenu, 'folder context menu was not opened');
      const addMenuItem = findAll(addMenu, 'button').find((button) => button.textContent === 'Add Data');
      assert.ok(addMenuItem, 'Add Data menu item missing');
      await addMenuItem.click(); await settle(40);
      const createForm = env.doc.querySelector('#editor-form');
      const createName = findAll(createForm, 'input').find((input) => input.type === 'text'); createName.value = 'created.pdf'; await createName.dispatch('input');
      const createDesc = findAll(createForm, 'textarea')[0]; createDesc.value = 'Created path'; await createDesc.dispatch('input');
      const createType = findAll(createForm, 'select')[0]; createType.value = 'file'; await createType.dispatch('change'); await settle(20);
      const createFile = findAll(createForm, 'input').find((input) => input.type === 'file'); createFile.files = [syntheticFile('created.pdf', 'application/pdf', '%PDF created')]; await createFile.dispatch('change'); await settle(60);
      await createForm.dispatch('submit', { preventDefault() {} }); await settle(160);
      const createdAdd = globalThis.window.__M5_EXPLORATION_STATUS__;
      assert.equal(createdAdd.totalCount, 3); assert.equal(createdAdd.revision, 1);
      assert.equal(env.doc.querySelector('#editor-form').hidden, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, true);
      const finalAttachment = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().entries.find((entry) => entry.originalName === 'created.pdf');
      assert.match(textOf(env.doc.querySelector('#label-host')), /created\.pdf/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    assert.equal(env.desktopSave.dataset.available, 'true');
    assert.equal(env.mobileSave.dataset.available, 'true');
    assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
    await env.desktopSave.click(); await settle(140);
    const savedStatus = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.ok(savedStatus.mapId); assert.equal(savedStatus.dirty, false); assert.equal(savedStatus.lastResult.wroteAttachmentCount, 1);
    assert.equal(env.saveState.textContent, 'Saved to IndexedDB on this device');
    if (process.env.P1B_EDITOR_CLEAN) {
      globalThis.window.__M5_P1B_TEST__.openDraft(); await settle(40);
      const cleanForm = env.doc.querySelector('#editor-form');
      assert.equal(cleanForm.hidden, false);
      await env.desktopOpen.click(); await settle(80);
      assert.equal(cleanForm.hidden, true);
      const cleanLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(cleanLibrary); assert.equal(cleanLibrary.hidden, false);
      await findAll(cleanLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BLOCKED) {
      globalThis.window.__M5_P1B_TEST__.closeRepository();
      globalThis.indexedDB.blockNextOpen = 1;
      await env.desktopOpen.click(); await settle(30);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().blocked, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /blocked/);
      assert.equal(env.desktopOpen.disabled, true);
      const blockedLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(blockedLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().blocked, false);
      await env.desktopOpen.click(); await settle(80);
      const retryLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(retryLibrary); assert.equal(retryLibrary.hidden, false);
      await findAll(retryLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_EDITOR_SYNC) {
      await env.desktopOpen.click(); await settle(30);
      let syncLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(syncLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(30);
      let syncMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(syncMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(30);
      let syncForm = env.doc.querySelector('#editor-form');
      let syncName = findAll(syncForm, 'input').find((input) => input.type === 'text'); syncName.value = 'Renamed Browser Map'; await syncName.dispatch('input');
      await syncForm.dispatch('submit', { preventDefault() {} }); await settle(120);
      assert.equal(syncForm.hidden, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.busy, null);
      assert.equal(env.desktopSave.disabled, true); assert.equal(env.desktopSave.dataset.available, 'false');
      assert.equal(env.mobileSave.disabled, true); assert.equal(env.mobileSave.dataset.available, 'false');
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(30);
      await env.desktopOpen.click(); await settle(30);
      syncLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(syncLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Renamed Browser Map/);
      globalThis.window.__M5_P1B_TEST__.openFirstFileMenu(); await settle(30);
      syncMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(syncMenu, 'button').find((button) => button.textContent === 'Edit Data').click(); await settle(30);
      syncForm = env.doc.querySelector('#editor-form');
      syncName = findAll(syncForm, 'input').find((input) => input.type === 'text'); syncName.value = 'note-renamed.txt'; await syncName.dispatch('input');
      let syncDescription = findAll(syncForm, 'textarea')[0] || findAll(syncForm, 'input').filter((input) => input.type === 'text')[1]; syncDescription.value = 'Edited data'; await syncDescription.dispatch('input');
      await syncForm.dispatch('submit', { preventDefault() {} }); await settle(140);
      assert.equal(syncForm.hidden, true); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      assert.equal(env.desktopSave.disabled, true); assert.equal(env.mobileSave.disabled, true);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_UNIFIED_R) {
      await env.desktopOpen.click(); await settle(30);
      const urLib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(urLib, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
      const startTotal = globalThis.window.__M5_EXPLORATION_STATUS__.totalCount;
      const startRev = globalThis.window.__M5_EXPLORATION_STATUS__.revision;
      // 1. Dirty Edit Folder + desktop toolbar Save applies and persists.
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(30);
      let urMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(urMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(30);
      let urForm = env.doc.querySelector('#editor-form');
      let urName = findAll(urForm, 'input').find((input) => input.type === 'text'); urName.value = 'Toolbar Saved Map'; await urName.dispatch('input');
      await env.desktopSave.click(); await settle(180);
      assert.equal(urForm.hidden, true); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, startRev + 1);
      // 2. Add PDF, injection fails after application; close retains node/bytes.
      const urAdd = () => {
        const details = globalThis.window.__M5_P1B_TEST__.openAddData();
        const form = env.doc.querySelector('#editor-form');
        const inputs = findAll(form, 'input'); const name = inputs.find((input) => input.type === 'text');
        const file = inputs.find((input) => input.type === 'file'); const desc = findAll(form, 'textarea')[0];
        name.value = 'retained.pdf'; desc.value = 'retained'; file.files = [syntheticFile('retained.pdf', 'application/pdf', '%PDF-retained')];
        return { form, name, desc, file };
      };
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      let urAddForm = urAdd();
      await urAddForm.file.dispatch('change'); await settle(40);
      globalThis.indexedDB.failNextWrite = 'maps';
      await urAddForm.form.dispatch('submit', { preventDefault() {} }); await settle(200);
      assert.equal(urAddForm.form.hidden, false);
      assert.match(env.doc.querySelector('#editor-status').textContent, /Changes remain in this map but have not been saved/);
      const appliedName = findAll(add.form, 'input').find((input) => input.type === 'text');
      const appliedType = findAll(add.form, 'select')[0];
      const appliedFile = findAll(add.form, 'input').find((input) => input.type === 'file');
      assert.equal(appliedName.readOnly, true); assert.equal(appliedType.disabled, true); assert.equal(appliedFile.disabled, true);
      for (const fn of globalThis.window.listeners.get('resize') || []) fn({}); await settle(20);
      assert.equal(appliedName.readOnly, true); assert.equal(appliedType.disabled, true); assert.equal(appliedFile.disabled, true);
      const failedTotal = globalThis.window.__M5_EXPLORATION_STATUS__.totalCount;
      const failedRev = globalThis.window.__M5_EXPLORATION_STATUS__.revision;
      const failedAttach = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot();
      assert.equal(failedTotal, startTotal + 1); assert.equal(failedRev, startRev + 2); assert.equal(failedAttach.size, 2);
      await findAll(urAddForm.form, 'button').find((button) => button.textContent === 'Close').click(); await settle(30);
      assert.equal(urAddForm.form.hidden, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, failedTotal);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 2);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      await env.desktopSave.click(); await settle(180);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      await env.desktopOpen.click(); await settle(30);
      const urLib2 = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(urLib2, 'button').find((button) => button.textContent === 'Open').click(); await settle(180);
      assert.match(textOf(env.doc.querySelector('#label-host')), /retained\.pdf/);
      // 3. New form after Close applies normally.
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      urMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(urMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      urForm = env.doc.querySelector('#editor-form');
      urName = findAll(urForm, 'input').find((input) => input.type === 'text'); urName.value = 'After Close Edit'; await urName.dispatch('input');
      const beforeNew = globalThis.window.__M5_EXPLORATION_STATUS__;
      await urForm.dispatch('submit', { preventDefault() {} }); await settle(180);
      assert.equal(urForm.hidden, true); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, beforeNew.revision + 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_CLOSE_ATTACH) {
      globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(20);
      const caForm = env.doc.querySelector('#editor-form');
      const caInputs = findAll(caForm, 'input');
      const caType = findAll(caForm, 'select')[0]; caType.value = 'file'; await caType.dispatch('change'); await settle(20);
      const caFile = findAll(caForm, 'input').find((input) => input.type === 'file' && !input.hasAttribute('webkitdirectory'));
      const caName = caInputs.find((input) => input.type === 'text'); const caDesc = findAll(caForm, 'textarea')[0];
      caName.value = 'retained.pdf'; caDesc.value = 'retained'; caFile.files = [syntheticFile('retained.pdf', 'application/pdf', '%PDF-retained')];
      await caFile.dispatch('change'); await settle(140);
      globalThis.indexedDB.failNextWrite = 'maps';
      await caForm.dispatch('submit', { preventDefault() {} }); await settle(200);
      assert.equal(caForm.hidden, false);
      assert.match(env.doc.querySelector('#editor-status').textContent, /Changes remain in this map but have not been saved/);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 2);
      await findAll(caForm, 'button').find((button) => button.textContent === 'Close').click(); await settle(40);
      assert.equal(caForm.hidden, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 2);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      await env.desktopSave.click(); await settle(180);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      await env.desktopOpen.click(); await settle(30);
      const caLib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(caLib, 'button').find((button) => button.textContent === 'Open').click(); await settle(180);
      assert.match(textOf(env.doc.querySelector('#label-host')), /retained\.pdf/);
      const caPdf = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'retained.pdf');
      const caRect = caPdf.parent.getBoundingClientRect();
      await env.doc.querySelector('#label-host').dispatch('click', { target: caPdf, button: 0, clientX: caRect.left + caRect.width / 2, clientY: caRect.top + caRect.height / 2 }); await settle(50);
      assert.ok(findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false));
      const caViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
      await findAll(caViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const caMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(caMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const caNewForm = env.doc.querySelector('#editor-form');
      assert.equal(findAll(caNewForm, 'input').find((input) => input.type === 'text').readOnly, false);
      assert.equal(findAll(caNewForm, 'select')[0].disabled, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_OWNER) {
      const downloadButton = env.doc.querySelector('[data-action="download"]');
      let ready = 0; while (globalThis.window.__M5_P1B_TEST__.snapshot().busy && ready < 800) { await settle(20); ready += 20; }
      const cancelButton = env.doc.querySelector('#backup-cancel');
      globalThis.window.__M5_P1B_TEST__.deferBackupStart();
      downloadButton.click();
      downloadButton.click();
      let waitBusy = 0; while (cancelButton.hidden && waitBusy < 1000) { await settle(20); waitBusy += 20; }
      assert.equal(cancelButton.hidden, false);
      await cancelButton.click(); await settle(20);
      assert.equal(cancelButton.hidden, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download cancelled/);
      globalThis.window.__M5_P1B_TEST__.releaseBackupStart(); await settle(40);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download cancelled/);
      const warning = 'Recovery durability warning: keep this tab open.';
      globalThis.window.__M5_P1B_TEST__.setShellStatusForTest(warning, { kind: 'actionable' });
      globalThis.window.__M5_P1B_TEST__.deferBackupStart();
      downloadButton.click();
      let waitWarningBusy = 0; while (cancelButton.hidden && waitWarningBusy < 1000) { await settle(20); waitWarningBusy += 20; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().message, warning, 'Download progress must not replace critical feedback');
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().kind, 'actionable');
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().timer, false);
      await cancelButton.click(); await settle(20);
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().message, warning, 'Download cancellation preserves critical feedback');
      globalThis.window.__M5_P1B_TEST__.releaseBackupStart(); await settle(40);
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().message, warning);
      downloadButton.click();
      let waitWarningComplete = 0; while ((globalThis.window.__M5_P1B_TEST__.backupBusy() || !cancelButton.hidden) && waitWarningComplete < 2000) { await settle(20); waitWarningComplete += 20; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().message, warning, 'Download completion preserves critical feedback');
      assert.equal(globalThis.window.__M5_P1B_TEST__.shellStatusState().timer, false);
      globalThis.window.__M5_P1B_TEST__.deferBackupStart();
      downloadButton.click();
      let wait2 = 0; while (cancelButton.hidden && wait2 < 1000) { await settle(20); wait2 += 20; }
      globalThis.window.__M5_P1B_TEST__.replaceSession();
      globalThis.window.__M5_P1B_TEST__.releaseBackupStart(); await settle(60);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().busy, 'loading');
      assert.equal(env.doc.querySelector('#shell-status').textContent, 'NEW SESSION');
      assert.equal(cancelButton.hidden, true);
      return;
    }
    if (process.env.P1B_BACKUP_UPLOAD_DIRTY) {
      const pkg = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Upload Draft'; await input.dispatch('input');
      const uploadButton = env.doc.querySelector('[data-action="upload"]');
      uploadButton.click();
      let fileInput = env.doc.querySelector('#fileorbit-backup-input');
      fileInput.files = [pkg]; await fileInput.dispatch('change');
      let waitPrompt = 0; while (env.doc.querySelector('#editor-prompt').hidden && waitPrompt < 1200) { await settle(20); waitPrompt += 20; }
      assert.equal(env.doc.querySelector('#editor-prompt').hidden, false);
      assert.equal(input.value, 'Upload Draft');
      await findAll(env.doc.querySelector('#editor-prompt'), 'button').find((button) => button.textContent === 'Continue editing').click(); await settle(20);
      assert.equal(form.hidden, false); assert.equal(input.value, 'Upload Draft');
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      uploadButton.click();
      fileInput = env.doc.querySelector('#fileorbit-backup-input');
      fileInput.files = [pkg]; await fileInput.dispatch('change');
      waitPrompt = 0; while (env.doc.querySelector('#editor-prompt').hidden && waitPrompt < 1200) { await settle(20); waitPrompt += 20; }
      await findAll(env.doc.querySelector('#editor-prompt'), 'button').find((button) => button.textContent === 'Discard changes').click();
      let waitInstall = 0; while (globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId !== null && waitInstall < 1800) { await settle(40); waitInstall += 40; }
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_OVERLAP_DISTINCT) {
      const a = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      let menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      let form = env.doc.querySelector('#editor-form');
      let input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'B Root'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(200);
      globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(20);
      form = env.doc.querySelector('#editor-form');
      const type = findAll(form, 'select')[0]; type.value = 'file'; await type.dispatch('change'); await settle(20);
      input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'b-only.pdf';
      const file = findAll(form, 'input').find((node) => node.type === 'file' && !node.hasAttribute('webkitdirectory'));
      const desc = findAll(form, 'textarea')[0]; desc.value = 'B'; file.files = [syntheticFile('b-only.pdf', 'application/pdf', '%PDF-B-only')];
      await file.dispatch('change'); await settle(140);
      await form.dispatch('submit', { preventDefault() {} }); await settle(220);
      const b = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const cancel = env.doc.querySelector('#backup-cancel');
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pendingA = globalThis.window.__M5_P1B_TEST__.importPackage(a);
      let w = 0; while (!globalThis.window.__M5_P1B_TEST__.importHashStarted() && w < 1000) { await settle(20); w += 20; }
      await cancel.click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pendingB = globalThis.window.__M5_P1B_TEST__.importPackage(b);
      let wb = 0; while (cancel.hidden && wb < 1000) { await settle(20); wb += 20; }
      assert.equal(cancel.hidden, false);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const ra = await pendingA; assert.equal(ra.ok, false);
      assert.equal(cancel.hidden, false);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const rb = await pendingB; assert.equal(rb.ok, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      const status = globalThis.window.__M5_EXPLORATION_STATUS__;
      assert.equal(status.totalCount, 3);
      assert.match(textOf(env.doc.querySelector('#label-host')), /B Root/);
      assert.match(textOf(env.doc.querySelector('#label-host')), /B Only|b-only\.pdf/);
      assert.ok(globalThis.window.__M5_P1B_TEST__.attachmentBytes('b-only.pdf'));
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_OVERLAP) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const cancel = env.doc.querySelector('#backup-cancel');
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const a = globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      let wait = 0; while (!globalThis.window.__M5_P1B_TEST__.importHashStarted() && wait < 1000) { await settle(20); wait += 20; }
      await cancel.click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const b = globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      let waitB = 0; while (cancel.hidden && waitB < 1000) { await settle(20); waitB += 20; }
      assert.equal(cancel.hidden, false);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const resultA = await a;
      assert.equal(resultA.ok, false);
      assert.equal(cancel.hidden, false);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const resultB = await b;
      assert.equal(resultB.ok, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_DUP) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'dup'; await input.dispatch('input');
      const result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'editor');
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const discard = findAll(env.doc.querySelector('#editor-prompt'), 'button').find((button) => button.textContent === 'Discard changes');
      await discard.click(); await discard.click();
      let wait = 0; while (globalThis.window.__M5_P1B_TEST__.importCommitCount() === commits && wait < 1800) { await settle(40); wait += 40; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_STALE) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.touch();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const beforeMap = globalThis.window.__M5_P1B_TEST__.snapshot().mapId;
      const result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'map');
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      globalThis.window.__M5_P1B_TEST__.replaceSession();
      await findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits);
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().pending, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().installing, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, beforeMap);
      assert.match(env.doc.querySelector('#shell-status').textContent, /stale|cancelled|NEW SESSION/i);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_LATE_FAIL) {
      const a = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Late B Root'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(200);
      const b = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const cancel = env.doc.querySelector('#backup-cancel');
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pendingA = globalThis.window.__M5_P1B_TEST__.importPackage(a);
      let w = 0; while (!globalThis.window.__M5_P1B_TEST__.importHashStarted() && w < 1000) { await settle(20); w += 20; }
      await cancel.click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pendingB = globalThis.window.__M5_P1B_TEST__.importPackage(b);
      let wb = 0; while (cancel.hidden && wb < 1000) { await settle(20); wb += 20; }
      globalThis.window.__M5_P1B_TEST__.failImportHash();
      const ra = await pendingA; assert.equal(ra.ok, false);
      assert.equal(cancel.hidden, false);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const rb = await pendingB; assert.equal(rb.ok, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Late B Root/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_DUP_MAP) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.touch();
      let commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      let saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      let prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      globalThis.window.__M5_P1B_TEST__.deferNextSave();
      const save = findAll(prompt, 'button').find((button) => button.textContent === 'Save and continue');
      await save.click(); await save.click();
      globalThis.window.__M5_P1B_TEST__.releaseDeferredSave();
      let waitSave = 0; while (globalThis.window.__M5_P1B_TEST__.importCommitCount() === commits && waitSave < 1800) { await settle(40); waitSave += 40; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      globalThis.window.__M5_P1B_TEST__.touch();
      await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      const discard = findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes');
      await discard.click(); await discard.click();
      let waitDiscard = 0; while (globalThis.window.__M5_P1B_TEST__.importCommitCount() === commits && waitDiscard < 1800) { await settle(40); waitDiscard += 40; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, null);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_DESTROY_DECISION) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.touch();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'map');
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().pending, false);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits);
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().registrySize, null);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_DESTROY_EDITOR) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'destroy draft'; await input.dispatch('input');
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'editor');
      const prompt = env.doc.querySelector('#editor-prompt');
      for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().pending, false);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_FORM_BLOCK) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      let openCalls = 0; let release; const gate = new Promise((resolve) => { release = resolve; });
      const handleA = { name: 'form-a.orbit', async getFile() { return { name: 'form-a.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write() {}, async close() { await gate; }, async abort() {} }; } };
      const handleB = { name: 'form-b.orbit', async getFile() { return { name: 'form-b.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) } }, async createWritable() { return { async write() {}, async close() {}, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => { openCalls += 1; return [openCalls === 1 ? handleA : handleB]; };
      globalThis.window.showSaveFilePicker = async () => handleA;
      await openViaFileChoice(env, 'Open map file'); await settle(220);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'A pending'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(40);
      const before = openCalls; await env.doc.querySelector('#open-orbit-action').click(); await settle(40);
      assert.equal(env.doc.querySelector('#open-orbit-menu').hidden, false, 'Open Orbit opens the submenu');
      assert.equal(openCalls, before, 'opening the submenu does not invoke the picker');
      await findAll(env.doc.body, 'button').find((button) => button.dataset.openKind === 'file').click(); await settle(40);
      assert.equal(openCalls, before, 'blocked Orbit File choice does not invoke the picker');
      assert.equal(globalThis.window.__M5_P1B_TEST__.editorState().formHidden, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().saving, true, 'editor remains in Saving while Open is blocked');
      release(); await settle(160);
      await openViaFileChoice(env, 'Open map file'); await settle(220);
      assert.equal(openCalls, before + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'form-b.orbit');
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_SAVE_DESTROY || process.env.P1B_SAVE_DESTROY_FAIL) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const failLate = Boolean(process.env.P1B_SAVE_DESTROY_FAIL);
      let release; const gate = new Promise((resolve) => { release = resolve; }); const writes = [];
      const handle = { name: 'destroy.orbit', async createWritable() { return { async write(blob) { writes.push(blob); }, async close() { await gate; if (failLate) throw new Error('late-destroy-failure'); }, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => [handle];
      globalThis.window.showSaveFilePicker = async () => handle;
      globalThis.window.__M5_P1B_TEST__.touch();
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      await env.desktopSave.click(); await settle(40);
      let wait = 0; while (!globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight && wait < 1000) { await settle(20); wait += 20; }
      const beforeStatus = env.doc.querySelector('#shell-status').textContent;
      const pagehide = globalThis.window.listeners.get('pagehide') || [];
      for (const fn of pagehide) fn({ persisted: false });
      for (const fn of pagehide) fn({ persisted: false });
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().destroying, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      release(); await settle(140);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      assert.equal(env.doc.querySelector('#shell-status').textContent, beforeStatus);
      assert.equal(writes.length, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_SOURCE_RELOCK) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const initialBytes = new TextEncoder().encode('%PDF-import-exact');
      const legacyBlob = await makeSyntheticPackage({ rootId: 'legacy-root', rootName: 'Legacy Fileorbit', fileName: 'import.pdf', bytes: initialBytes });
      const legacyBytes = new Uint8Array(await legacyBlob.arrayBuffer());
      let invalid = false;
      const writes = []; let closeCount = 0;
      const handleC = { name: 'new-copy.orbit', async createWritable() { return { async write(blob) { writes.push(blob); }, async close() {}, async abort() {} }; } };
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      await openViaFileChoice(env, 'Open map file'); await settle(40);
      const fallbackInput = env.doc.querySelector('#fileorbit-backup-input'); assert.ok(fallbackInput);
      fallbackInput.files = [new File([legacyBytes], 'legacy.orbit', { type: 'application/x-orbit' })];
      await fallbackInput.dispatch('change'); await settle(240);
      globalThis.window.showSaveFilePicker = async () => handleC;
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, null); assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().mode, 'download');
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('import.pdf')), Array.from(initialBytes));
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Legacy After Open'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(240);
      assert.equal(closeCount, 0); assert.equal(writes.length, 1); assert.equal(invalid, false); assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleC);
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('import.pdf')), Array.from(initialBytes));
      globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(20);
      const addForm = env.doc.querySelector('#editor-form');
      const type = findAll(addForm, 'select')[0]; type.value = 'file'; await type.dispatch('change'); await settle(20);
      const name = findAll(addForm, 'input').find((node) => node.type === 'text'); name.value = 'added.pdf';
      const addDesc = findAll(addForm, 'textarea')[0]; addDesc.value = 'Added PDF'; await addDesc.dispatch('input');
      const fileInput = findAll(addForm, 'input').find((node) => node.type === 'file' && !node.hasAttribute('webkitdirectory'));
      fileInput.files = [syntheticFile('added.pdf', 'application/pdf', '%PDF-added-exact')];
      await fileInput.dispatch('change'); await settle(140);
      await addForm.dispatch('submit', { preventDefault() {} }); await settle(260);
      assert.equal(closeCount, 0); assert.equal(writes.length, 2); assert.equal(invalid, false);
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('import.pdf')), Array.from(initialBytes));
      assert.equal(new TextDecoder().decode(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('added.pdf')), '%PDF-added-exact');
      let decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[1]);
      assert.equal(decoded.tree.name, 'Legacy After Open');
      assert.deepEqual(decoded.attachments.find((entry) => entry.name === 'import.pdf').bytes, Array.from(initialBytes));
      assert.deepEqual(decoded.attachments.find((entry) => entry.name === 'added.pdf').bytes, Array.from(new TextEncoder().encode('%PDF-added-exact')));
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(240);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleC);
      decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[2]);
      assert.deepEqual(decoded.attachments.find((entry) => entry.name === 'import.pdf').bytes, Array.from(initialBytes));
      assert.deepEqual(decoded.attachments.find((entry) => entry.name === 'added.pdf').bytes, Array.from(new TextEncoder().encode('%PDF-added-exact')));
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_STALE_RETRY) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      const downloadBlobs = []; const realCreate = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { downloadBlobs.push(blob); return realCreate(blob); };
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Stale Retry Edit'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} });
      let wait = 0; while (downloadBlobs.length < 1 && wait < 2000) { await settle(20); wait += 20; }
      assert.equal(downloadBlobs.length, 1); assert.ok(globalThis.window.__M5_P1B_TEST__.operation());
      const before = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      const ids = before.tree.children.map((node) => node.id); const bytes = before.attachments[0].bytes;
      const rev = globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision; const hist = globalThis.window.__M5_P1B_TEST__.historyState().undo; const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.staleAppliedOwner();
      await form.dispatch('submit', { preventDefault() {} }); await settle(100);
      assert.equal(downloadBlobs.length, 1); assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), null);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision, rev);
      assert.equal(globalThis.window.__M5_P1B_TEST__.historyState().undo, hist);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      const after = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      assert.deepEqual(after.tree.children.map((node) => node.id), ids);
      assert.deepEqual(after.attachments[0].bytes, bytes);
      const close = findAll(form, 'button').find((button) => button.textContent === 'Close'); await close.click(); await settle(40);
      assert.equal(form.hidden, true); assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes(before.attachments[0].name)), bytes);
      URL.createObjectURL = realCreate;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_FALLBACK_FORM_IMPORT || process.env.P1B_FALLBACK_FORM_LOCAL) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      const downloadBlobs = []; const anchors = [];
      const realCreate = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { downloadBlobs.push(blob); return realCreate(blob); };
      const realCreateElement = env.doc.createElement.bind(env.doc);
      env.doc.createElement = (tag) => { const el = realCreateElement(tag); if (String(tag).toLowerCase() === 'a') anchors.push(el); return el; };
      const isLocal = Boolean(process.env.P1B_FALLBACK_FORM_LOCAL);
      let fixture = null; let beforeRecord = null;
      if (isLocal) {
        fixture = await globalThis.window.__M5_P1B_TEST__.saveRepositoryFixture('Fallback Local');
        beforeRecord = await globalThis.window.__M5_P1B_TEST__.repositoryRecord(fixture.mapId);
        await env.desktopOpen.click(); await settle(60);
        const lib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
        const row = findAll(lib, '.saved-map-row').find((item) => item.dataset.mapId === fixture.mapId);
        await findAll(row, 'button').find((button) => button.textContent === 'Open').click(); await settle(240);
        const opened = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
        assert.deepEqual(opened.tree.children.map((node) => node.id), beforeRecord.tree.children.map((node) => node.id));
        assert.deepEqual(opened.attachments[0].bytes, beforeRecord.attachmentBytes[0].bytes);
      } else {
        const bBlob = await makeSyntheticPackage({ rootId: 'imp-root', rootName: 'Import Fallback', fileName: 'import.pdf', bytes: new TextEncoder().encode('%PDF-import-exact') });
        await env.doc.querySelector('[data-action="upload"]').click(); await settle(20);
        const input = env.doc.querySelector('#fileorbit-backup-input');
        input.files = [new File([new Uint8Array(await bBlob.arrayBuffer())], 'import.orbit', { type: 'application/x-orbit' })];
        await input.dispatch('change'); await settle(260);
      }
      const before = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      const originalIds = before.tree.children.map((node) => node.id);
      const fileName = isLocal ? 'note.txt' : 'import.pdf';
      const originalBytes = Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes(fileName));
      const startRev = globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision;
      const startHistory = globalThis.window.__M5_P1B_TEST__.historyState().undo;
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Fallback Edited'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} });
      let wait = 0; while (downloadBlobs.length < 1 && wait < 2000) { await settle(20); wait += 20; }
      assert.equal(downloadBlobs.length, 1); assert.equal(anchors.length, 1);
      assert.match(anchors[0].download, /\.orbit$/); assert.doesNotMatch(anchors[0].download, /\.orbit\.orbit$/i);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision, startRev + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.historyState().undo, startHistory + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, null);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map/);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download started|cannot confirm/i);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      const owner = globalThis.window.__M5_P1B_TEST__.operation(); assert.ok(owner);
      let decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(downloadBlobs[0]);
      assert.equal(decoded.tree.name, 'Fallback Edited');
      assert.deepEqual(decoded.tree.children.map((node) => node.id), originalIds);
      assert.deepEqual(decoded.attachments[0].bytes, originalBytes);
      await form.dispatch('submit', { preventDefault() {} });
      let waitRetry = 0; while (downloadBlobs.length < 2 && waitRetry < 2000) { await settle(20); waitRetry += 20; }
      assert.equal(downloadBlobs.length, 2);
      assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), owner);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision, startRev + 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.historyState().undo, startHistory + 1);
      decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(downloadBlobs[1]);
      assert.equal(decoded.tree.name, 'Fallback Edited');
      assert.deepEqual(decoded.attachments[0].bytes, originalBytes);
      await findAll(form, 'button').find((button) => button.textContent === 'Close').click(); await settle(60);
      assert.equal(form.hidden, true); assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), null);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes(fileName)), originalBytes);
      const finalPackage = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      assert.equal(finalPackage.tree.name, 'Fallback Edited');
      assert.deepEqual(finalPackage.attachments[0].bytes, originalBytes);
      const incomingBlob = await makeSyntheticPackage({ rootId: 'incoming-root', rootName: 'Incoming Map', fileName: 'incoming.bin', bytes: new TextEncoder().encode('INCOMING-EXACT') });
      const commitsStart = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      const openIncoming = async () => { await openViaFileChoice(env, 'Open map file'); await settle(20); const picker = env.doc.querySelector('#fileorbit-backup-input'); picker.files = [new File([new Uint8Array(await incomingBlob.arrayBuffer())], 'incoming.orbit', { type: 'application/x-orbit' })]; await picker.dispatch('change'); await settle(140); return env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false); };
      let pendingPrompt = await openIncoming(); assert.ok(pendingPrompt);
      let downloadsBefore = downloadBlobs.length;
      await findAll(pendingPrompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(100);
      let waitHandoff = 0; while (downloadBlobs.length === downloadsBefore && waitHandoff < 2000) { await settle(20); waitHandoff += 20; }
      assert.equal(downloadBlobs.length, downloadsBefore + 1); assert.equal(pendingPrompt.hidden, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commitsStart);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Fallback Edited/);
      await findAll(pendingPrompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(40);
      assert.equal(pendingPrompt.hidden, true); assert.match(textOf(env.doc.querySelector('#label-host')), /Fallback Edited/);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commitsStart);
      pendingPrompt = await openIncoming(); assert.ok(pendingPrompt); downloadsBefore = downloadBlobs.length;
      await findAll(pendingPrompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(100);
      waitHandoff = 0; while (downloadBlobs.length === downloadsBefore && waitHandoff < 2000) { await settle(20); waitHandoff += 20; }
      assert.equal(pendingPrompt.hidden, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commitsStart);
      const discard = findAll(pendingPrompt, 'button').find((button) => button.textContent === 'Discard changes');
      await discard.click(); await settle(200);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commitsStart + 1);
      await discard.click(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commitsStart + 1);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Incoming Map/);
      assert.deepEqual(Array.from(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('incoming.bin')), Array.from(new TextEncoder().encode('INCOMING-EXACT')));
      if (isLocal) {
        const afterRecord = await globalThis.window.__M5_P1B_TEST__.repositoryRecord(fixture.mapId);
        assert.deepEqual(afterRecord.tree, beforeRecord.tree);
        assert.deepEqual(afterRecord.attachmentBytes, beforeRecord.attachmentBytes);
        assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      }
      URL.createObjectURL = realCreate; env.doc.createElement = realCreateElement;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_FALLBACK_LOCAL) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      const fixture = await globalThis.window.__M5_P1B_TEST__.saveRepositoryFixture('Fallback Local');
      await env.desktopOpen.click(); await settle(60);
      const lib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const row = findAll(lib, '.saved-map-row').find((item) => item.dataset.mapId === fixture.mapId);
      await findAll(row, 'button').find((button) => button.textContent === 'Open').click(); await settle(240);
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await settle(100);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download started/);
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, null);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_LOCAL_SAVE) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const fixture = await globalThis.window.__M5_P1B_TEST__.saveRepositoryFixture('Legacy Local');
      assert.ok(fixture.mapId);
      const before = await globalThis.window.__M5_P1B_TEST__.repositoryRecord(fixture.mapId);
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      await env.desktopOpen.click(); await settle(60);
      const lib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const row = findAll(lib, '.saved-map-row').find((item) => item.dataset.mapId === fixture.mapId);
      assert.ok(row);
      await findAll(row, 'button').find((button) => button.textContent === 'Open').click(); await settle(260);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Browser Map/);
      assert.equal(new TextDecoder().decode(await globalThis.window.__M5_P1B_TEST__.attachmentBytes('note.txt')), 'hello');
      const writes = []; let pickerCalls = 0;
      const handle = { name: 'legacy-edited.orbit', async createWritable() { return { async write(blob) { writes.push(blob); }, async close() {}, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => [handle];
      globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; return handle; };
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Legacy Edited'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(260);
      assert.equal(pickerCalls, 1); assert.equal(writes.length, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handle);
      let decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[0]);
      assert.equal(decoded.tree.name, 'Legacy Edited');
      assert.ok(decoded.attachments.some((entry) => entry.name === 'note.txt' && new TextDecoder().decode(new Uint8Array(entry.bytes)) === 'hello'));
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      const after = await globalThis.window.__M5_P1B_TEST__.repositoryRecord(fixture.mapId);
      assert.deepEqual(after.tree, before.tree);
      assert.deepEqual(after.attachmentBytes, before.attachmentBytes);
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await settle(220);
      assert.equal(pickerCalls, 1); assert.equal(writes.length, 2);
      decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[1]);
      assert.equal(decoded.tree.name, 'Legacy Edited');
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_IMPORT_SAVE) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const aBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const bBytes = new TextEncoder().encode('%PDF-B-import');
      const bFileObj = new Blob([bBytes], { type: 'application/pdf' });
      const bClassification = { format: 'pdf', badge: 'PDF', needsReview: false };
      const bRegistry = createAttachmentRegistry({ datasetToken: 777 });
      bRegistry.adopt({ attachmentId: 'att_b', file: bFileObj, metadata: { attachmentId: 'att_b', originalName: 'b.pdf', sizeBytes: bBytes.length, mime: 'application/pdf', classification: bClassification } });
      const bTree = { id: 'b-root', kind: 'folder', name: 'Imported B', children: [{ id: 'b-file', kind: 'file', name: 'b.pdf', data: { description: 'B backup', link: null, dataType: 'file', attachmentId: 'att_b', originalName: 'b.pdf', sizeBytes: bBytes.length, mime: 'application/pdf', classification: bClassification } }] };
      const bBlob = (await encodeBackup({ tree: bTree, registry: bRegistry, mapName: 'Imported B' })).blob;
      let releaseB; let enteredB; const closeEnteredB = new Promise((resolve) => { enteredB = resolve; }); const gateB = new Promise((resolve) => { releaseB = resolve; });
      const writesA = []; const writesB = [];
      const handleA = { name: 'a-import.orbit', async getFile() { return { name: 'a-import.orbit', size: aBlob.size, type: 'application/x-orbit', slice: (a, b) => aBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writesA.push(blob); }, async close() {}, async abort() {} }; } };
      const handleB = { name: 'b-import.orbit', async createWritable() { const chunks = []; return { async write(blob) { chunks.push(blob); writesB.push(blob); }, async close() { enteredB(); await gateB; }, async abort() {} }; } };
      let pickerCalls = 0; let cancelSave = true;
      globalThis.window.showOpenFilePicker = async () => [handleA];
      globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; if (cancelSave) { const e = new Error('cancel'); e.name = 'AbortError'; throw e; } return handleB; };
      await openViaFileChoice(env, 'Open map file'); await settle(240);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleA);
      await env.doc.querySelector('[data-action="upload"]').click(); await settle(20);
      const input = env.doc.querySelector('#fileorbit-backup-input');
      input.files = [new File([new Uint8Array(await bBlob.arrayBuffer())], 'b-import.orbit', { type: 'application/x-orbit' })];
      await input.dispatch('change'); await settle(260);
      let state = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(state.active, false); assert.equal(state.handle, null);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Imported B/);
      assert.equal(writesA.length, 0);
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      await env.desktopSave.click(); await settle(80);
      assert.equal(pickerCalls, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, null);
      cancelSave = false;
      await env.desktopSave.click(); await closeEnteredB;
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, null);
      releaseB(); await settle(160);
      state = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(state.handle, handleB); assert.equal(env.saveState.textContent, 'Saved');
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      let decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writesB[0]);
      assert.equal(decoded.tree.name, 'Imported B');
      assert.ok(decoded.attachments.some((entry) => entry.name === 'b.pdf' && entry.bytes.length > 0));
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form'); const text = findAll(form, 'input').find((node) => node.type === 'text'); text.value = 'B Edited'; await text.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(200);
      assert.equal(writesB.length, 2); assert.equal(pickerCalls, 2);
      decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writesB[1]);
      assert.equal(decoded.tree.name, 'B Edited');
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_REPLACE_ACTUAL || process.env.P1B_REPLACE_ACTUAL_FAIL || process.env.P1B_REPLACE_CANCEL) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      let releaseA; let enteredA; const closeEnteredA = new Promise((resolve) => { enteredA = resolve; }); const gateA = new Promise((resolve) => { releaseA = resolve; });
      let releaseB; let enteredB; const closeEnteredB = new Promise((resolve) => { enteredB = resolve; }); const gateB = new Promise((resolve) => { releaseB = resolve; });
      const failA = Boolean(process.env.P1B_REPLACE_ACTUAL_FAIL); const cancelOpen = Boolean(process.env.P1B_REPLACE_CANCEL);
      const writesA = []; const writesB = []; let closesA = 0; let closesB = 0;
      const handleA = { name: 'replace-a.orbit', async getFile() { return { name: 'replace-a.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writesA.push(blob); }, async close() { enteredA(); await gateA; if (failA) throw new Error('a-close-failed'); closesA += 1; }, async abort() {} }; } };
      const handleB = { name: 'replace-b.orbit', async getFile() { return { name: 'replace-b.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writesB.push(blob); }, async close() { enteredB(); await gateB; closesB += 1; }, async abort() {} }; } };
      let openCalls = 0;
      globalThis.window.showOpenFilePicker = async () => { openCalls += 1; if (cancelOpen) { const e = new Error('cancel'); e.name = 'AbortError'; throw e; } return [handleB]; };
      globalThis.window.showSaveFilePicker = async () => openCalls === 0 ? handleA : handleB;
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await closeEnteredA;
      const savesBefore = globalThis.window.__M5_P1B_TEST__.saveCount();
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().owner !== null, true);
      await openViaFileChoice(env, 'Open map file'); await settle(80);
      if (cancelOpen) {
        assert.equal(openCalls, 1);
        assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().owner !== null, true);
        releaseA(); await settle(160);
        assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleA);
        assert.equal(env.saveState.textContent, 'Saved');
        delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
        return;
      }
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      assert.ok(prompt);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(260);
      const stateB = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(stateB.handle, handleB);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().owner, null);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), savesBefore);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'B Edited'; await input.dispatch('input');
      const bSave = form.dispatch('submit', { preventDefault() {} });
      await settle(30);
      releaseA();
      await bSave;
      await closeEnteredB;
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleB);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, true);
      releaseB(); await settle(180);
      assert.equal(writesB.length, 1); assert.equal(closesB, 1); assert.equal(writesA.length, 1);
      const decodedB = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writesB[0]);
      assert.equal(decodedB.tree.name, 'B Edited');
      assert.ok(decodedB.attachments.some((entry) => entry.bytes.length > 0));
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), savesBefore);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_SAVE_LIFECYCLE) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      let releaseA; const gateA = new Promise((resolve) => { releaseA = resolve; }); let aFail = true;
      let releaseB; const gateB = new Promise((resolve) => { releaseB = resolve; });
      let nextHandle = null; const writes = [];
      const makeHandle = (name, gate, failGetter) => ({ name, async createWritable() { const chunks = []; return { async write(blob) { chunks.push(blob); writes.push({ name, blob }); }, async close() { await gate; if (failGetter()) throw new Error('late-close-failure'); }, async abort() {} }; } });
      const handleA = makeHandle('lifecycle-a.orbit', gateA, () => aFail);
      const handleB = makeHandle('lifecycle-b.orbit', gateB, () => false);
      globalThis.window.showOpenFilePicker = async () => [handleA];
      globalThis.window.showSaveFilePicker = async () => nextHandle;
      nextHandle = handleA;
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await settle(40);
      let wait = 0; while (!globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight && wait < 1000) { await settle(20); wait += 20; }
      const stateA = globalThis.window.__M5_P1B_TEST__.documentSaveState();
      assert.equal(stateA.inFlight, true);
      globalThis.window.__M5_P1B_TEST__.replaceSession();
      globalThis.window.__M5_P1B_TEST__.settleSession();
      globalThis.window.__M5_P1B_TEST__.touch();
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      nextHandle = handleB;
      await env.desktopSave.click(); await settle(40);
      let waitB = 0; while (globalThis.window.__M5_P1B_TEST__.documentSaveState().owner === stateA.owner && waitB < 1000) { await settle(20); waitB += 20; }
      const stateB = globalThis.window.__M5_P1B_TEST__.documentSaveState();
      assert.equal(stateB.inFlight, false, 'B waits for the in-flight A writer instead of overlapping');
      releaseA(); await settle(120);
      let waitBStart = 0; while (!globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight && waitBStart < 1000) { await settle(20); waitBStart += 20; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, true, 'B starts after A settles');
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().active, false);
      assert.match(env.doc.querySelector('#shell-status').textContent, /NEW SESSION|Saving|Download/i);
      releaseB(); await settle(160);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'lifecycle-b.orbit');
      assert.equal(env.saveState.textContent, 'Saved');
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().inFlight, false);
      const decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes.find((entry) => entry.name === 'lifecycle-b.orbit').blob);
      assert.match(decoded.tree.name, /Browser Map/);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_SAVE_STAGES) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const writes = []; let requestCalls = 0; let next = null; let abortPicker = false;
      const makeHandle = (name, permission) => ({ name, async queryPermission() { return permission === 'prompt' || permission === 'denied' ? 'prompt' : 'granted'; }, async requestPermission() { requestCalls += 1; return permission === 'denied' ? 'denied' : 'granted'; }, async createWritable() { return { async write(blob) { writes.push({ name, blob }); }, async close() {}, async abort() {} }; } });
      const handleA = makeHandle('stages-a.orbit', 'granted'); const handleB = makeHandle('stages-b.orbit', 'prompt'); const handleC = makeHandle('stages-c.orbit', 'denied');
      globalThis.window.showOpenFilePicker = async () => [handleA];
      globalThis.window.showSaveFilePicker = async () => { if (abortPicker) { const e = new Error('native save dialog aborted'); e.name = 'AbortError'; throw e; } return next; };
      globalThis.window.__M5_P1B_TEST__.touch();
      next = handleA;
      await env.desktopSave.click(); await settle(240);
      assert.equal(writes.length, 1); assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleA);
      assert.equal(requestCalls, 0);
      next = handleB;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(240);
      assert.equal(writes.length, 2); assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleB);
      assert.equal(requestCalls, 1);
      const revision = globalThis.window.__M5_P1B_TEST__.documentState().savedRevision;
      next = handleC;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(160);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleB);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().savedRevision, revision);
      let failure = globalThis.window.__M5_P1B_TEST__.documentSaveState().lastFailure;
      assert.equal(failure.stage, 'permission-request'); assert.equal(failure.reason, 'permission-denied');
      assert.match(env.doc.querySelector('#shell-status').textContent, /permission-request|permission was not granted/i);
      abortPicker = true;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(160);
      failure = globalThis.window.__M5_P1B_TEST__.documentSaveState().lastFailure;
      assert.equal(failure.stage, 'picker'); assert.equal(failure.reason, 'cancelled');
      assert.equal(env.doc.querySelector('#shell-status').textContent, 'Changes remain in this map but have not been saved.');
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handle, handleB);
      assert.equal(writes.length, 2);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), 1);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_SAVE_AS) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      let pickerCalls = 0; const writesA = []; let closesA = 0;
      let nextSaveHandle = null; let saveCancel = false;
      const makeHandle = (name, behavior = {}) => ({ name,
        async getFile() { return { name, size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; },
        async createWritable() { if (behavior.createFail) throw new Error('create-writable-failed'); const chunks = [];
          let aborted = 0; return { async write(blob) { chunks.push(blob); if (behavior.writeFail) throw new Error('write-failed'); }, async close() { if (behavior.closeGate) await behavior.closeGate; if (behavior.closeFail) throw new Error('close-failed'); behavior.closed = (behavior.closed || 0) + 1; behavior.chunks = chunks; }, async abort() { aborted += 1; behavior.aborted = aborted; } }; } });
      const aBehavior = { closeFail: true }; const handleA = makeHandle('a.orbit', aBehavior); const bCreateFail = makeHandle('b-create-fail.orbit', { createFail: true }); const bWriteFail = makeHandle('b-write-fail.orbit', { writeFail: true }); const bCloseFail = makeHandle('b-close-fail.orbit', { closeFail: true });
      let releaseClose; const closeGate = new Promise((resolve) => { releaseClose = resolve; }); const cBehavior = { closeGate }; const handleC = makeHandle('c.orbit', cBehavior);
      globalThis.window.showOpenFilePicker = async () => [handleA];
      globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; if (saveCancel) { const e = new Error('cancel'); e.name = 'AbortError'; throw e; } return nextSaveHandle; };
      await openViaFileChoice(env, 'Open map file'); await settle(240);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      let form = env.doc.querySelector('#editor-form');
      let input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Edited A'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(200);
      assert.equal(form.hidden, false);
      const closeButton = findAll(form, 'button').find((button) => button.textContent === 'Close');
      assert.equal(closeButton.disabled, false); await closeButton.click(); await settle(80);
      assert.equal(form.hidden, true); assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      aBehavior.closeFail = false;
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      const authoritative = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      saveCancel = true;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(120);
      assert.equal(pickerCalls, 1); assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.equal(env.doc.querySelector('#shell-status').textContent, 'Changes remain in this map but have not been saved.');
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      saveCancel = false; nextSaveHandle = bCreateFail;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(120);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /could not|fail/i);
      nextSaveHandle = bWriteFail;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(120);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /could not|fail/i);
      nextSaveHandle = bCloseFail;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(120);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
      const beforeCapture = globalThis.window.__M5_P1B_TEST__.snapshot();
      nextSaveHandle = handleC;
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'a.orbit');
      const captured = await globalThis.window.__M5_P1B_TEST__.decodeDocument(await globalThis.window.__M5_P1B_TEST__.exportPackage());
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const laterMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(laterMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const laterForm = env.doc.querySelector('#editor-form');
      const laterInput = findAll(laterForm, 'input').find((node) => node.type === 'text'); laterInput.value = 'Later C'; await laterInput.dispatch('input');
      await laterForm.dispatch('submit', { preventDefault() {} }); await settle(60);
      assert.ok(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision > beforeCapture.dataRevision);
      releaseClose(); await settle(160);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'c.orbit');
      const state = globalThis.window.__M5_P1B_TEST__.snapshot();
      assert.equal(state.dirty, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().savedRevision, beforeCapture.dataRevision);
      const decodedC = await globalThis.window.__M5_P1B_TEST__.decodeDocument(cBehavior.chunks[0]);
      assert.equal(decodedC.tree.name, captured.tree.name);
      assert.deepEqual(decodedC.attachments, captured.attachments);
      assert.equal(authoritative.tree.name, captured.tree.name);
      const laterClose = findAll(laterForm, 'button').find((button) => button.textContent === 'Close');
      assert.equal(laterClose.disabled, false); await laterClose.click(); await settle(60);
      const closesBefore = cBehavior.closed || 0;
      const pickersBefore = pickerCalls;
      await env.desktopSave.click(); await settle(240);
      assert.equal(pickerCalls, pickersBefore); assert.equal(cBehavior.closed, closesBefore + 1);
      assert.equal(env.saveState.textContent, 'Saved'); assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_FALLBACK_PICKER) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      await openViaFileChoice(env, 'Open map file'); await settle(20);
      const input = env.doc.querySelector('#fileorbit-backup-input');
      assert.equal(input.clickCount, 1);
      assert.match(input.accept, /\.orbit/); assert.doesNotMatch(input.accept, /\.map/); assert.doesNotMatch(input.accept, /\.fileorbit/);
      assert.equal(input.dataset.asDocument, 'true');
      const bytes = new Uint8Array(await packageBlob.arrayBuffer());
      input.files = [new File([bytes], 'fallback.orbit', { type: 'application/x-orbit' })];
      await input.dispatch('change'); await settle(260);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Opened fallback\.orbit/);
      let state = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(state.active, true); assert.equal(state.mode, 'download'); assert.equal(state.handleName, null);
      assert.equal(env.saveState.textContent, 'Saved');
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive);
      await env.doc.querySelector('[data-action="upload"]').click(); await settle(20);
      assert.equal(input.clickCount, 2); assert.equal(input.dataset.asDocument, 'false');
      input.files = [new File([bytes], 'fallback.orbit', { type: 'application/x-orbit' })];
      await input.dispatch('change'); await settle(260);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Backup restored/);
      state = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(state.active, false); assert.equal(state.handleName, null);
      assert.equal(env.saveState.textContent, 'Restored map — not saved yet');
      await openViaFileChoice(env, 'Open map file'); await settle(20);
      assert.equal(input.clickCount, 3);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_NEW_DOCUMENT) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const writes = []; let closes = 0; let pickerCalls = 0;
      const handle = { name: 'new-map.orbit', async createWritable() { return { async write(blob) { writes.push(blob); }, async close() { closes += 1; }, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => [handle];
      globalThis.window.showSaveFilePicker = async () => { pickerCalls += 1; return handle; };
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await settle(260);
      await env.desktopSave.click(); await settle(260);
      assert.equal(pickerCalls, 1); assert.equal(writes.length, 1); assert.equal(closes, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'new-map.orbit');
      assert.equal(env.saveState.textContent, 'Saved');
      let decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[0]);
      assert.match(decoded.tree.name, /Browser Map/);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'New Doc Saved'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(260);
      assert.equal(pickerCalls, 1); assert.equal(writes.length, 2); assert.equal(closes, 2);
      decoded = await globalThis.window.__M5_P1B_TEST__.decodeDocument(writes[1]);
      assert.equal(decoded.tree.name, 'New Doc Saved');
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_NEW_FALLBACK) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      globalThis.window.__M5_P1B_TEST__.touch();
      const saves = globalThis.window.__M5_P1B_TEST__.saveCount();
      await env.desktopSave.click(); await settle(80);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download started/);
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      await env.desktopOpen.click(); await settle(60);
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      assert.ok(prompt);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(100);
      assert.equal(prompt.hidden, false);
      const totalBefore = globalThis.window.__M5_EXPLORATION_STATUS__.totalCount;
      await findAll(prompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(40);
      assert.equal(prompt.hidden, true); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, totalBefore);
      await env.desktopOpen.click(); await settle(60);
      const prompt2 = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      await findAll(prompt2, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(100);
      assert.equal(prompt2.hidden, false);
      await findAll(prompt2, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download started/);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), saves);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_APPLIED_SESSION) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      let releaseWrite; let writeStartedResolve; const writeStarted = new Promise((resolve) => { writeStartedResolve = resolve; });
      const gate = new Promise((resolve) => { releaseWrite = resolve; });
      const writes = [];
      const handle = { name: 'owner.orbit', async getFile() { return { name: 'owner.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writes.push(blob); writeStartedResolve(); await gate; }, async close() {}, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => [handle];
      globalThis.window.showSaveFilePicker = async () => handle;
      await openViaFileChoice(env, 'Open map file'); await settle(220);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Owner Change'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} });
      let wait = 0; while (globalThis.window.__M5_P1B_TEST__.operation() === null && wait < 1000) { await settle(20); wait += 20; }
      await Promise.race([writeStarted, settle(1000)]); await settle(20);
      const owner = globalThis.window.__M5_P1B_TEST__.operation();
      assert.ok(owner); assert.equal(owner.session, globalThis.window.__M5_P1B_TEST__.snapshot().session ?? owner.session);
      globalThis.window.__M5_P1B_TEST__.replaceSession();
      assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), null);
      releaseWrite(); await settle(80);
      assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), null);
      assert.match(env.doc.querySelector('#shell-status').textContent, /NEW SESSION|stale/i);
      assert.equal(writes.length, 1);
      delete globalThis.window.showOpenFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DOCUMENT_REPLACEMENT) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const writes = []; let closes = 0;
      const makeHandle = (name) => ({ name, async getFile() { return { name, size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writes.push({ name, blob }); }, async close() { closes += 1; }, async abort() {} }; } });
      const firstHandle = makeHandle('first.orbit'); const secondHandle = makeHandle('second.orbit');
      let pick = 0; globalThis.window.showOpenFilePicker = async () => [pick++ === 0 ? firstHandle : secondHandle];
      globalThis.window.showSaveFilePicker = async () => secondHandle;
      const savesBefore = globalThis.window.__M5_P1B_TEST__.saveCount();
      await openViaFileChoice(env, 'Open map file'); await settle(220);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'first.orbit');
      globalThis.window.__M5_P1B_TEST__.touch();
      await openViaFileChoice(env, 'Open map file'); await settle(60);
      const prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      assert.ok(prompt);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(300);
      assert.equal(writes.length, 1); assert.equal(writes[0].name, 'first.orbit'); assert.equal(closes, 1);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), savesBefore);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'second.orbit');
      assert.match(env.doc.querySelector('#shell-status').textContent, /Opened second\.orbit/);
      assert.equal(env.saveState.textContent, 'Saved');
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DOCUMENT_IMPORT) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const writes = [];
      const firstHandle = { name: 'first.orbit', async getFile() { return { name: 'first.orbit', size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writes.push({ name: 'first.orbit', blob }); }, async close() {}, async abort() {} }; } };
      const newHandle = { name: 'new.orbit', async createWritable() { return { async write(blob) { writes.push({ name: 'new.orbit', blob }); }, async close() {}, async abort() {} }; } };
      globalThis.window.showOpenFilePicker = async () => [firstHandle];
      globalThis.window.showSaveFilePicker = async () => newHandle;
      await openViaFileChoice(env, 'Open map file'); await settle(220);
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'first.orbit');
      const imported = await globalThis.window.__M5_P1B_TEST__.importPackage(packageBlob);
      assert.equal(imported.ok, true);
      const state = globalThis.window.__M5_P1B_TEST__.documentState();
      assert.equal(state.active, false); assert.equal(state.handleName, null);
      assert.equal(env.saveState.textContent, 'Restored map — not saved yet');
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(220);
      assert.equal(writes.length, 1); assert.equal(writes[0].name, 'new.orbit');
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentState().handleName, 'new.orbit');
      assert.equal(writes.filter((entry) => entry.name === 'first.orbit').length, 0);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DOCUMENT_FALLBACK) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await openViaFileChoice(env, 'Open map file'); await settle(20);
      const input = env.doc.querySelector('#fileorbit-backup-input');
      assert.ok(input); assert.match(input.accept, /\.orbit/); assert.doesNotMatch(input.accept, /\.fileorbit/);
      input.files = [new File([bytes], 'legacy.orbit', { type: 'application/x-orbit' })];
      await input.dispatch('change'); await settle(240);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Opened legacy\.orbit/);
      assert.equal(env.saveState.textContent, 'Saved');
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopSave.click(); await settle(80);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Download started/);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const editForm = env.doc.querySelector('#editor-form');
      const editInput = findAll(editForm, 'input').find((node) => node.type === 'text'); editInput.value = 'Retry Owner'; await editInput.dispatch('input');
      const revision = globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision;
      await editForm.dispatch('submit', { preventDefault() {} }); await settle(120);
      const owner = globalThis.window.__M5_P1B_TEST__.operation();
      assert.ok(owner); assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision, owner.revision);
      await findAll(editForm, 'button').find((button) => button.textContent === 'Retry Save').click(); await settle(120);
      assert.equal(globalThis.window.__M5_P1B_TEST__.operation(), owner);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dataRevision, owner.revision);
      assert.equal(textOf(env.doc.querySelector('#editor-status')).trim(), 'Changes remain in this map but have not been saved.');
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DOCUMENT) {
      globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ = false;
      const packageBlob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const writes = []; let closes = 0; let nextCloseError = false;
      const makeHandle = (name) => ({ name, async getFile() { return { name, size: packageBlob.size, type: 'application/x-orbit', slice: (a, b) => packageBlob.slice(a, b) }; }, async createWritable() { return { async write(blob) { writes.push({ name, blob }); }, async close() { if (nextCloseError) { nextCloseError = false; throw new Error('close-failed'); } closes += 1; }, async abort() {} }; } });
      const firstHandle = makeHandle('first.orbit'); const secondHandle = makeHandle('copy.orbit');
      globalThis.window.showOpenFilePicker = async () => [firstHandle];
      globalThis.window.showSaveFilePicker = async () => secondHandle;
      await openViaFileChoice(env, 'Open map file'); await settle(240);
      assert.equal(env.saveState.textContent, 'Saved');
      assert.match(env.doc.querySelector('#shell-status').textContent, /Opened first\.orbit/);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'File Saved'; await input.dispatch('input');
      await form.dispatch('submit', { preventDefault() {} }); await settle(240);
      assert.equal(form.hidden, true); assert.equal(closes, 1); assert.equal(writes.length, 1); assert.equal(writes[0].name, 'first.orbit');
      assert.equal(env.saveState.textContent, 'Saved');
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(240);
      assert.equal(writes.length, 2); assert.equal(writes[1].name, 'copy.orbit');
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      nextCloseError = true;
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.doc.querySelector('[data-action="save-document"]')?.click?.();
      // failure path is exercised through Save As to the same handle with close throwing
      await env.doc.querySelector('[data-action="save-document-as"]').click(); await settle(120);
      assert.match(env.saveState.textContent, /Unsaved changes|Restored map — not saved yet/);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      delete globalThis.window.showOpenFilePicker; delete globalThis.window.showSaveFilePicker;
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_STORAGE_COPY) {
      const saveState = env.doc.querySelector('#save-state');
      const help = env.doc.querySelector('#storage-help');
      const helpText = env.doc.querySelector('#storage-help-text');
      assert.equal(saveState.textContent, 'Saved to IndexedDB on this device');
      assert.equal(helpText.hidden, true);
      await help.click();
      assert.equal(helpText.hidden, false); assert.equal(help.getAttribute('aria-expanded'), 'true');
      assert.match(helpText.textContent, /\.orbit/); assert.match(helpText.textContent, /IndexedDB/); assert.doesNotMatch(helpText.textContent, /\.fileorbit/);
      await help.click(); assert.equal(helpText.hidden, true);
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const imported = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(imported.ok, true);
      assert.equal(saveState.textContent, 'Restored map — not saved yet');
      await env.desktopSave.click();
      let wait = 0; while (globalThis.window.__M5_EXPLORATION_STATUS__.persistence.busy && wait < 1200) { await settle(40); wait += 40; }
      assert.equal(saveState.textContent, 'Saved to IndexedDB on this device');
      globalThis.window.__M5_P1B_TEST__.touch();
      assert.equal(saveState.textContent, 'Unsaved changes');
      await env.desktopSave.click();
      let wait2 = 0; while (globalThis.window.__M5_EXPLORATION_STATUS__.persistence.busy && wait2 < 1200) { await settle(40); wait2 += 40; }
      await env.desktopOpen.click(); await settle(40);
      const lib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(lib, 'button').find((button) => button.textContent === 'Open').click(); await settle(200);
      assert.equal(saveState.textContent, 'Saved to IndexedDB on this device');
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_DESTROY) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const commits = globalThis.window.__M5_P1B_TEST__.importCommitCount();
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pending = globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      let wait = 0; while (!globalThis.window.__M5_P1B_TEST__.importHashStarted() && wait < 1000) { await settle(20); wait += 20; }
      for (const fn of globalThis.window.listeners.get('pagehide') || []) fn({ persisted: false });
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const result = await pending;
      assert.equal(result.ok, false); assert.equal(result.reason, 'cancelled');
      assert.equal(globalThis.window.__M5_P1B_TEST__.importCommitCount(), commits);
      assert.equal(globalThis.window.__M5_P1B_TEST__.pendingImportState().pending, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_CANCEL) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const before = globalThis.window.__M5_P1B_TEST__.snapshot();
      globalThis.window.__M5_P1B_TEST__.deferImportHash();
      const pendingImport = globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      let waitHash = 0; while (!globalThis.window.__M5_P1B_TEST__.importHashStarted() && waitHash < 1200) { await settle(20); waitHash += 20; }
      assert.equal(globalThis.window.__M5_P1B_TEST__.importHashStarted(), true);
      const cancel = env.doc.querySelector('#backup-cancel'); assert.equal(cancel.hidden, false);
      await cancel.click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.releaseImportHash();
      const result = await pendingImport;
      assert.equal(result.ok, false); assert.equal(result.reason, 'cancelled');
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, before.mapId);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      assert.equal(cancel.hidden, true);
      // Preparation failure preserves authoritative map.
      globalThis.window.__M5_P1B_TEST__.failNextImportPreparation();
      const prep = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(prep.ok, false);
      assert.match(env.doc.querySelector('#shell-status').textContent, /Backup import preparation failed/);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, before.mapId);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      // Recovery success: draw fails once, recovery draws successfully.
      globalThis.window.__M5_P1B_TEST__.failFrame('backup-import', 'draw');
      const recovered = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(recovered.ok, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().mapId, before.mapId);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, true);
      globalThis.__FAIL_DRAW__ = true;
      const failedRecovery = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      delete globalThis.__FAIL_DRAW__;
      assert.equal(failedRecovery.ok, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.editor.inert, true);
      assert.match(env.doc.querySelector('#shell-status').textContent, /could not be restored/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_PDF) {
      globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(20);
      const form = env.doc.querySelector('#editor-form');
      const type = findAll(form, 'select')[0]; type.value = 'file'; await type.dispatch('change'); await settle(20);
      const name = findAll(form, 'input').find((input) => input.type === 'text');
      const file = findAll(form, 'input').find((input) => input.type === 'file' && !input.hasAttribute('webkitdirectory'));
      const desc = findAll(form, 'textarea')[0];
      name.value = 'backup.pdf'; desc.value = 'PDF backup'; file.files = [syntheticFile('backup.pdf', 'application/pdf', '%PDF-backup-bytes')];
      await file.dispatch('change'); await settle(140);
      await form.dispatch('submit', { preventDefault() {} }); await settle(220);
      assert.match(textOf(env.doc.querySelector('#label-host')), /backup\.pdf/);
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
      const folderForm = env.doc.querySelector('#editor-form');
      const folderName = findAll(folderForm, 'input').find((input) => input.type === 'text'); folderName.value = 'Old Only'; await folderName.dispatch('input');
      await folderForm.dispatch('submit', { preventDefault() {} }); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 4);
      const sourceId = globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId;
      const imported = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(imported.ok, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.doesNotMatch(textOf(env.doc.querySelector('#label-host')), /Old Only/);
      assert.match(textOf(env.doc.querySelector('#label-host')), /backup\.pdf/);
      const pdfName = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'backup.pdf');
      const rect = pdfName.parent.getBoundingClientRect();
      await env.doc.querySelector('#label-host').dispatch('click', { target: pdfName, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }); await settle(50);
      assert.ok(findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false));
      const pdfViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
      await findAll(pdfViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      await env.desktopSave.click(); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      const importedId = globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId;
      assert.ok(importedId); assert.notEqual(importedId, sourceId);
      await env.desktopOpen.click(); await settle(40);
      let pdfLib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const importedRow = findAll(pdfLib, '.saved-map-row').find((row) => row.dataset.mapId === importedId);
      assert.ok(importedRow);
      await findAll(importedRow, 'button').find((button) => button.textContent === 'Open').click(); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.match(textOf(env.doc.querySelector('#label-host')), /backup\.pdf/);
      const reopenedPdf = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'backup.pdf');
      const reopenedRect = reopenedPdf.parent.getBoundingClientRect();
      await env.doc.querySelector('#label-host').dispatch('click', { target: reopenedPdf, button: 0, clientX: reopenedRect.left + reopenedRect.width / 2, clientY: reopenedRect.top + reopenedRect.height / 2 }); await settle(50);
      assert.ok(findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false));
      const restoredBytes = await globalThis.window.__M5_P1B_TEST__.attachmentBytes('backup.pdf');
      assert.equal(new TextDecoder().decode(restoredBytes), '%PDF-backup-bytes');
      const reopenedViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
      await findAll(reopenedViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      await env.desktopOpen.click(); await settle(40);
      pdfLib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const sourceRow = findAll(pdfLib, '.saved-map-row').find((row) => row.dataset.mapId === sourceId);
      assert.ok(sourceRow);
      await findAll(sourceRow, 'button').find((button) => button.textContent === 'Open').click(); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 4);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Old Only/);
      globalThis.window.__M5_P1B_TEST__.destroyViewer();
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_FAIL) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      const before = globalThis.window.__M5_P1B_TEST__.snapshot();
      for (const boundary of ['draw', 'labels', 'installHit']) {
        globalThis.window.__M5_P1B_TEST__.failFrame('backup-import', boundary);
        const result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
        assert.equal(result.ok, false);
        const after = globalThis.window.__M5_P1B_TEST__.snapshot();
        assert.equal(after.mapId, before.mapId);
        assert.equal(after.dataRevision, before.dataRevision);
        assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
        assert.match(env.doc.querySelector('#shell-status').textContent, /Backup import failed/);
        globalThis.window.__M5_P1B_TEST__.clearFrameFailures();
      }
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_REPLACE) {
      const incoming = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const addMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(addMenu, 'button').find((button) => button.textContent === 'Add Folder').click(); await settle(20);
      const addForm = env.doc.querySelector('#editor-form');
      const addName = findAll(addForm, 'input').find((input) => input.type === 'text'); addName.value = 'Old Only Folder'; await addName.dispatch('input');
      await addForm.dispatch('submit', { preventDefault() {} }); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Old Only Folder/);
      const sourceId = globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId;
      const imported = await globalThis.window.__M5_P1B_TEST__.importPackage(incoming);
      assert.equal(imported.ok, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      assert.doesNotMatch(textOf(env.doc.querySelector('#label-host')), /Old Only Folder/);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
      await env.desktopSave.click(); await settle(200);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId);
      assert.notEqual(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, sourceId);
      await env.desktopOpen.click(); await settle(40);
      const lib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const rows = findAll(lib, 'button').filter((button) => button.textContent === 'Open');
      assert.ok(rows.length >= 2);
      await rows[rows.length - 1].click(); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.match(textOf(env.doc.querySelector('#label-host')), /Old Only Folder/);
      return;
    }
    if (process.env.P1B_BACKUP_DECISIONS) {
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      let menu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(menu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      let form = env.doc.querySelector('#editor-form');
      const input = findAll(form, 'input').find((node) => node.type === 'text'); input.value = 'Draft Preserved'; await input.dispatch('input');
      const bad = await globalThis.window.__M5_P1B_TEST__.importPackage(new Blob([new Uint8Array(20)]));
      assert.equal(bad.ok, false); assert.equal(form.hidden, false); assert.equal(input.value, 'Draft Preserved');
      let result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'editor');
      const prompt = env.doc.querySelector('#editor-prompt'); assert.equal(prompt.hidden, false);
      await findAll(prompt, 'button').find((button) => button.textContent === 'Continue editing').click(); await settle(20);
      assert.equal(form.hidden, false); assert.equal(input.value, 'Draft Preserved');
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'editor');
      await findAll(env.doc.querySelector('#editor-prompt'), 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(220);
      assert.equal(env.doc.querySelector('#editor-form').hidden, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      await env.desktopSave.click(); await settle(180);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      globalThis.window.__M5_P1B_TEST__.touch();
      result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'map');
      const mapPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      assert.ok(mapPrompt);
      await findAll(mapPrompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      const failPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      globalThis.indexedDB.failNextWrite = 'maps';
      await findAll(failPrompt, 'button').find((button) => button.textContent === 'Save and continue').click();
      let waitFail = 0; while (!/could not be saved|failed/i.test(textOf(failPrompt)) && waitFail < 1500) { await settle(40); waitFail += 40; }
      assert.match(textOf(failPrompt), /injected write failure|could not be saved|failed/i);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      await findAll(failPrompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(220);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      result = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(result.pending, 'map');
      const savePrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop' && child.hidden === false);
      await findAll(savePrompt, 'button').find((button) => button.textContent === 'Save and continue').click();
      let waitSaveOk = 0; while (!savePrompt.hidden && waitSaveOk < 1800) { await settle(40); waitSaveOk += 40; }
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, null);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP_EVENT) {
      const before = globalThis.window.__M5_EXPLORATION_STATUS__;
      const downloaded = await globalThis.window.__M5_P1B_TEST__.startDownload();
      assert.equal(downloaded.ok, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, before.persistence.dirty);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.savedRevision, before.persistence.savedRevision);
      const input = globalThis.window.__M5_P1B_TEST__.chooseBackup();
      assert.ok(input);
      input.files = [downloaded.blob];
      await input.dispatch('change');
      let waited = 0; while (!/Backup restored/.test(env.doc.querySelector('#shell-status').textContent) && waited < 2000) { await settle(40); waited += 40; }
      assert.match(env.doc.querySelector('#shell-status').textContent, /Backup restored/);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, before.totalCount);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_BACKUP) {
      const sourceId = globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId;
      const blob = await globalThis.window.__M5_P1B_TEST__.exportPackage();
      assert.ok(blob && blob.size > 20);
      const imported = await globalThis.window.__M5_P1B_TEST__.importPackage(blob);
      assert.equal(imported.ok, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
      assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      await env.desktopSave.click();
      let waitSave = 0; while (globalThis.window.__M5_EXPLORATION_STATUS__.persistence.busy && waitSave < 1200) { await settle(40); waitSave += 40; }
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      assert.notEqual(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, sourceId);
      await env.desktopOpen.click(); await settle(40);
      const bLib = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const rows = findAll(bLib, 'button').filter((button) => button.textContent === 'Open');
      assert.ok(rows.length >= 2);
      await rows[0].click(); await settle(200);
      assert.match(textOf(env.doc.querySelector('#label-host')), /note\.txt/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_RETRY_DEFER) {
      globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(20);
      const addForm = env.doc.querySelector('#editor-form');
      const type = findAll(addForm, 'select')[0]; type.value = 'file'; await type.dispatch('change'); await settle(20);
      const inputs = findAll(addForm, 'input'); const appliedName = inputs.find((input) => input.type === 'text');
      const appliedFile = findAll(addForm, 'input').find((input) => input.type === 'file' && !input.hasAttribute('webkitdirectory'));
      const desc = findAll(addForm, 'textarea')[0];
      appliedName.value = 'deferred.pdf'; desc.value = 'deferred'; appliedFile.files = [syntheticFile('deferred.pdf', 'application/pdf', '%PDF-deferred')];
      await appliedFile.dispatch('change'); await settle(140);
      globalThis.indexedDB.failNextWrite = 'maps';
      await addForm.dispatch('submit', { preventDefault() {} }); await settle(200);
      assert.match(env.doc.querySelector('#editor-status').textContent, /Changes remain in this map but have not been saved/);
      const appliedType = findAll(addForm, 'select')[0];
      assert.equal(appliedName.readOnly, true); assert.equal(appliedType.disabled, true); assert.equal(appliedFile.disabled, true);
      for (const fn of globalThis.window.listeners.get('resize') || []) fn({}); await settle(20);
      assert.equal(appliedName.readOnly, true); assert.equal(appliedType.disabled, true); assert.equal(appliedFile.disabled, true);
      assert.equal(findAll(addForm, 'button').find((button) => button.textContent === 'Retry Save').disabled, false);
      // First retry fails again: applied form and locks retained, then Close re-enabled.
      globalThis.indexedDB.failNextWrite = 'maps';
      globalThis.window.__M5_P1B_TEST__.deferNextSave();
      addForm.dispatch('submit', { preventDefault() {} }); await settle(20);
      const firstClose = findAll(addForm, 'button').find((button) => button.textContent === 'Close');
      assert.equal(firstClose.disabled, true);
      globalThis.window.__M5_P1B_TEST__.releaseDeferredSave();
      let waitClose = 0; while (firstClose.disabled && waitClose < 1200) { await settle(40); waitClose += 40; }
      assert.equal(firstClose.disabled, false);
      assert.equal(addForm.hidden, false);
      assert.equal(env.doc.querySelector('#editor-status').textContent, 'Changes remain in this map but have not been saved.');
      assert.equal(env.doc.querySelector('#editor-error').textContent, '');
      assert.equal(env.doc.querySelector('#save-feedback').hidden, true, 'retry storage failure owns one editor message');
      assert.equal(globalThis.window.__M5_P1B_TEST__.documentSaveState().saving, false);
      assert.equal(globalThis.window.__M5_P1B_TEST__.snapshot().dirty, true);
      assert.equal(appliedName.value, 'deferred.pdf');
      assert.equal(findAll(addForm, 'button').find((button) => button.textContent === 'Retry Save').disabled, false);
      assert.equal(findAll(addForm, 'button').find((button) => button.textContent === 'Save As').hidden, false);

      assert.equal(appliedName.readOnly, true); assert.equal(appliedType.disabled, true); assert.equal(appliedFile.disabled, true);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, 1);
      // Second retry is deferred; Close/Escape cannot close; duplicate toolbar cannot add requests.
      const beforeCalls = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.deferNextSave();
      addForm.dispatch('submit', { preventDefault() {} }); await settle(20);
      const secondClose = findAll(addForm, 'button').find((button) => button.textContent === 'Close');
      assert.equal(secondClose.disabled, true);
      await secondClose.click(); await settle(20);
      await appliedName.dispatch('keydown', { key: 'Escape', preventDefault() {} }); await settle(20);
      assert.equal(addForm.hidden, false);
      assert.equal(appliedName.value, 'deferred.pdf');
      await env.desktopSave.click(); await env.mobileSave.click();
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), beforeCalls + 1);
      globalThis.window.__M5_P1B_TEST__.releaseDeferredSave();
      let waitDone = 0; while (!addForm.hidden && waitDone < 1500) { await settle(40); waitDone += 40; }
      assert.equal(addForm.hidden, true);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), beforeCalls + 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 3);
      assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 2);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(20);
      const freshMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(freshMenu, 'button').find((button) => button.textContent === 'Edit Folder').click(); await settle(20);
      const freshForm = env.doc.querySelector('#editor-form');
      const freshInput = findAll(freshForm, 'input').find((input) => input.type === 'text'); freshInput.value = 'independent draft'; await freshInput.dispatch('input');
      await settle(30);
      assert.equal(freshForm.hidden, false); assert.equal(freshInput.value, 'independent draft');
      assert.equal(freshInput.readOnly, false); assert.equal(findAll(freshForm, 'select')[0].disabled, false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DUP_SAVE) {
      globalThis.window.__M5_P1B_TEST__.touch();
      const beforeSaveCount = globalThis.window.__M5_P1B_TEST__.saveCount();
      globalThis.window.__M5_P1B_TEST__.delayNextSave(160);
      await env.desktopSave.click(); await settle(25);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.busy, 'saving');
      assert.equal(env.desktopSave.disabled, true); assert.equal(env.mobileSave.disabled, true);
      await env.desktopSave.click(); await env.mobileSave.click();
      globalThis.window.__M5_P1B_TEST__.touch();
      await settle(220);
      assert.equal(globalThis.window.__M5_P1B_TEST__.saveCount(), beforeSaveCount + 1);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'save-conflict-backdrop' && !child.hidden), false);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_USAGE || process.env.P1B_USAGE_UNKNOWN) {
      await env.desktopOpen.click(); await settle(80);
      const usageLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      for (let i = 0; i < 150 && !/Application attachment usage/.test(textOf(usageLibrary)); i += 1) await settle(20);
      assert.match(textOf(usageLibrary), /Application attachment usage/, 'saved-map usage section rendered');
      assert.ok(usageLibrary);
      const usageText = textOf(usageLibrary);
      assert.match(usageText, /Application attachment usage/);
      if (process.env.P1B_USAGE) {
        assert.match(usageText, /Browser origin estimate/);
        assert.match(usageText, /not granted/);
        await findAll(usageLibrary, 'button').find((button) => button.textContent === 'Request persistent storage').click(); await settle(200);
        assert.match(textOf(usageLibrary), /Persistent storage granted/);
      } else {
        assert.match(usageText, /Browser origin estimate: unavailable/);
        assert.match(usageText, /Persistent storage: unknown/);
        await findAll(usageLibrary, 'button').find((button) => button.textContent === 'Request persistent storage').click(); await settle(30);
        assert.match(textOf(usageLibrary), /Persistent storage is unavailable/);
      }
      await findAll(usageLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_ADD_DATA) {
      await env.desktopOpen.click(); await settle(30);
      const addLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(addLibrary);
      await findAll(addLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
      globalThis.window.__M5_P1B_TEST__.openFolderMenu(); await settle(40);
      const addMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      assert.ok(addMenu, 'folder context menu was not opened');
      await findAll(addMenu, 'button').find((button) => button.textContent === 'Add Data').click(); await settle(40);
      const addForm = env.doc.querySelector('#editor-form');
      assert.ok(addForm); assert.equal(addForm.hidden, false);
      const addName = findAll(addForm, 'input').find((input) => input.type === 'text'); addName.value = 'doc.pdf'; await addName.dispatch('input');
      const addDescription = findAll(addForm, 'textarea')[0]; addDescription.value = 'Synthetic PDF'; await addDescription.dispatch('input');
      const dataType = findAll(addForm, 'select')[0];
      dataType.value = 'file'; await dataType.dispatch('change'); await settle(20);
      const pdfInput = findAll(addForm, 'input').find((input) => input.type === 'file' && !input.hasAttribute('webkitdirectory'));
      assert.ok(pdfInput); pdfInput.files = [syntheticFile('doc.pdf', 'application/pdf', '%PDF-1.4 synthetic')]; await pdfInput.dispatch('change'); await settle(60);
      const addSave = findAll(addForm, 'button').find((button) => button.textContent === 'Save');
      assert.equal(addSave.disabled, false);
      if (process.env.P1B_ADD_CANCEL) {
        const withFile = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot();
        assert.equal(withFile.size, 2);
        await findAll(addForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(40);
        const afterCancel = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot();
        assert.equal(afterCancel.size, 1);
        assert.equal(afterCancel.totalBytes < withFile.totalBytes, true);
        assert.equal(env.doc.querySelector('#editor-form').hidden, true);
        assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, 0);
        globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(30);
        const switchForm = env.doc.querySelector('#editor-form');
        const switchType = findAll(switchForm, 'select')[0]; switchType.value = 'file'; await switchType.dispatch('change'); await settle(20);
        const switchFile = findAll(switchForm, 'input').find((input) => input.type === 'file'); switchFile.files = [syntheticFile('switch.pdf', 'application/pdf', '%PDF switch')]; await switchFile.dispatch('change'); await settle(60);
        assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 2);
        switchType.value = 'web-link'; await switchType.dispatch('change'); await settle(40);
        assert.equal(globalThis.window.__M5_P1B_TEST__.attachmentSnapshot().size, 1);
        await findAll(switchForm, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30);
        delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
        return;
      }
      const beforeAdd = globalThis.window.__M5_EXPLORATION_STATUS__;
      if (process.env.P1B_ADD_FAIL_RETRY) {
        const reservationBefore = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot();
        globalThis.window.__M5_P1B_TEST__.failFrame('add-data', 'draw');
        await addForm.dispatch('submit', { preventDefault() {} }); await settle(160);
        const failedReservation = globalThis.window.__M5_P1B_TEST__.attachmentSnapshot();
        const failedCounts = globalThis.window.__M5_P1B_TEST__.frameCounts();
        assert.equal(failedCounts['add-data:draw'], 1);
        assert.equal(failedCounts['recovery:draw'], 1);
        assert.equal(failedCounts['recovery:labels'], 1);
        assert.equal(failedCounts['recovery:installHit'], 1);
        assert.equal(failedCounts['resize:draw'] || 0, 0);
        assert.equal(failedReservation.size, reservationBefore.size);
        assert.equal(failedReservation.totalBytes, reservationBefore.totalBytes);
        assert.equal(failedReservation.entries.find((entry) => entry.originalName === 'doc.pdf')?.attachmentId, reservationBefore.entries.find((entry) => entry.originalName === 'doc.pdf')?.attachmentId);
        assert.equal(env.doc.querySelector('#editor-form').hidden, false);
        assert.equal(findAll(addForm, 'input').find((input) => input.type === 'text').value, 'doc.pdf');
        globalThis.window.__M5_P1B_TEST__.clearFrameFailures();
        assert.equal(env.doc.querySelector('#editor-form').hidden, false);
        assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, beforeAdd.revision);
        assert.equal(addSave.disabled, false);
        assert.doesNotMatch(env.doc.querySelector('#editor-status').textContent, /^Saving/);
        assert.match(env.doc.querySelector('#editor-status').textContent, /Save failed/);
        assert.equal(env.desktopSave.disabled, false);
        await addForm.dispatch('submit', { preventDefault() {} }); await settle(180);
      } else {
        await addForm.dispatch('submit', { preventDefault() {} }); await settle(160);
      }
      const afterAdd = globalThis.window.__M5_EXPLORATION_STATUS__;
      assert.equal(afterAdd.totalCount, beforeAdd.totalCount + 1);
      assert.equal(afterAdd.revision, beforeAdd.revision + 1);
      assert.equal(env.doc.querySelector('#editor-form').hidden, true);
      assert.equal(afterAdd.persistence.dirty, false);
      assert.equal(env.desktopSave.disabled, true); assert.equal(env.mobileSave.disabled, true);
      assert.match(textOf(env.doc.querySelector('#label-host')), /doc\.pdf/);
      const pdfName = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'doc.pdf');
      const pdfLabel = pdfName.parent; const pdfRect = pdfLabel.getBoundingClientRect();
      await env.doc.querySelector('#label-host').dispatch('click', { target: pdfName, button: 0, clientX: pdfRect.left + pdfRect.width / 2, clientY: pdfRect.top + pdfRect.height / 2 }); await settle(40);
      const pdfViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
      assert.ok(pdfViewer, 'new PDF filename did not open the viewer');
      await findAll(pdfViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_DELETE_OWNERSHIP) {
      const backdrops = () => env.overlayHost.children.filter((child) => child.className === 'delete-confirm-backdrop');
      assert.equal(backdrops().length, 1, 'initial Delete confirmation ownership');
      const firstConfirmation = backdrops()[0];
      for (let index = 0; index < 2; index += 1) {
        await env.desktopOpen.click(); await settle(40);
        const library = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
        await findAll(library, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
        assert.equal(backdrops().length, 1, 'Delete confirmation count after Open ' + index);
      }
      assert.equal(firstConfirmation.parent, null, 'replaced Delete confirmation was not disconnected');
      assert.equal(firstConfirmation.hidden, true, 'replaced Delete confirmation remains visible');
      const beforeDelete = globalThis.window.__M5_EXPLORATION_STATUS__;
      globalThis.window.__M5_P1B_TEST__.openFirstFileMenu(); await settle(40);
      const fileMenu = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      assert.ok(fileMenu);
      await findAll(fileMenu, 'button').find((button) => button.textContent === 'Delete Data').click(); await settle(40);
      let visibleConfirmations = backdrops().filter((node) => node.hidden === false);
      assert.equal(visibleConfirmations.length, 1);
      await findAll(visibleConfirmations[0], 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeDelete.totalCount);
      globalThis.window.__M5_P1B_TEST__.openFirstFileMenu(); await settle(40);
      const fileMenu2 = env.overlayHost.children.find((child) => child.className === 'editor-context-menu' && child.hidden === false);
      await findAll(fileMenu2, 'button').find((button) => button.textContent === 'Delete Data').click(); await settle(40);
      visibleConfirmations = backdrops().filter((node) => node.hidden === false);
      assert.equal(visibleConfirmations.length, 1);
      await findAll(visibleConfirmations[0], 'button').find((button) => button.textContent === 'Delete').click(); await settle(180);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeDelete.totalCount - 1);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_CONFLICT) {
      await globalThis.window.__M5_P1B_TEST__.simulateExternalSave(); await settle(120);
      globalThis.window.__M5_P1B_TEST__.touch();
      const beforeConflict = globalThis.window.__M5_EXPLORATION_STATUS__;
      await env.desktopSave.click(); await settle(120);
      let conflict = env.overlayHost.children.find((child) => child.className === 'save-conflict-backdrop');
      assert.ok(conflict); assert.equal(conflict.hidden, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeConflict.totalCount);
      await findAll(conflict, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(30);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, beforeConflict.persistence.mapId);
      await env.desktopSave.click(); await settle(120);
      conflict = env.overlayHost.children.find((child) => child.className === 'save-conflict-backdrop');
      await findAll(conflict, 'button').find((button) => button.textContent === 'Save as new copy').click(); await settle(220);
      const copied = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.ok(copied.mapId); assert.notEqual(copied.mapId, beforeConflict.persistence.mapId);

      assert.equal(await globalThis.window.__M5_P1B_TEST__.listCount(), 2);
      await globalThis.window.__M5_P1B_TEST__.simulateExternalSave(); await settle(120);
      await env.desktopSave.click(); await settle(120);
      conflict = env.overlayHost.children.find((child) => child.className === 'save-conflict-backdrop');
      await findAll(conflict, 'button').find((button) => button.textContent === 'Reload saved version').click(); await settle(20);
      await findAll(conflict, 'button').find((button) => button.textContent === 'Discard and reload').click(); await settle(220);
      const reloaded = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(reloaded.mapId, copied.mapId); assert.equal(reloaded.dirty, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeConflict.totalCount);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_NARROW) {
      await env.mapMenuButton.click(); await settle(20);
      assert.equal(env.mapMenu.hidden, false);
      await env.mobileOpen.click(); await settle(80);
      assert.equal(env.mapMenu.hidden, true);
      let narrowLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(narrowLibrary); assert.equal(narrowLibrary.hidden, false);
      await findAll(narrowLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      globalThis.window.__M5_P1B_TEST__.openDraft(); await settle(40);
      const narrowForm = env.doc.querySelector('#editor-form');
      const narrowInput = findAll(narrowForm, 'input').find((node) => node.type === 'text');
      narrowInput.value = 'Narrow draft'; await narrowInput.dispatch('input'); await settle(20);
      await env.mapMenuButton.click(); await settle(20);
      await env.mobileOpen.click(); await settle(20);
      assert.equal(env.mapMenu.hidden, true);
      const narrowPrompt = env.doc.querySelector('#editor-prompt');
      assert.equal(narrowPrompt.hidden, false);
      await findAll(narrowPrompt, 'button').find((button) => button.textContent === 'Continue editing').click(); await settle(20);
      assert.equal(narrowForm.hidden, false); assert.equal(narrowInput.value, 'Narrow draft');
      await env.mapMenuButton.click(); await settle(20);
      await env.mobileOpen.click(); await settle(20);
      await findAll(narrowPrompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      narrowLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(narrowLibrary); assert.equal(narrowLibrary.hidden, false);
      assert.equal(env.overlayHost.children.filter((child) => child.className === 'saved-maps-backdrop' && !child.hidden).length, 1);
      await findAll(narrowLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_EDITOR_OPEN) {
      globalThis.window.__M5_P1B_TEST__.openDraft(); await settle(40);
      const form = env.doc.querySelector('#editor-form');
      assert.ok(form); assert.equal(form.hidden, false);
      const input = findAll(form, 'input').find((node) => node.type === 'text');
      input.value = 'Edited draft'; await input.dispatch('input'); await settle(20);
      await env.desktopOpen.click(); await settle(20);
      const editorPrompt = env.doc.querySelector('#editor-prompt');
      assert.ok(editorPrompt); assert.equal(editorPrompt.hidden, false);
      await findAll(editorPrompt, 'button').find((button) => button.textContent === 'Continue editing').click(); await settle(20);
      assert.equal(form.hidden, false); assert.equal(input.value, 'Edited draft');
      assert.equal(env.overlayHost.children.some((child) => child.className === 'saved-maps-backdrop' && !child.hidden), false);
      await env.desktopOpen.click(); await settle(20);
      await findAll(editorPrompt, 'button').find((button) => button.textContent === 'Discard changes').click(); await settle(80);
      const editorLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(editorLibrary); assert.equal(editorLibrary.hidden, false);
      await findAll(editorLibrary, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_OWNER_PLAIN) {
      await env.desktopOpen.click(); await settle(40);
      const plainLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.guard, false);
      globalThis.window.__M5_P1B_TEST__.delayNextOpen(120);
      await findAll(plainLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(25);
      const plainDuring = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(plainDuring.busy, 'loading'); assert.equal(plainDuring.guard, true);
      assert.equal(env.doc.querySelector('#undo-history').disabled, true);
      await settle(160);
      const plainAfter = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(plainAfter.guard, false); assert.equal(plainAfter.busy, null); assert.equal(plainAfter.mapId, savedStatus.mapId);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_EMPTY_OPEN_FAIL) {
      const empty = env.doc.querySelector('#fixture'); empty.value = ''; await empty.dispatch('change'); await settle(20);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      await env.desktopOpen.click(); await settle(30);
      const emptyFailLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      globalThis.__FAIL_DRAW__ = true;
      await findAll(emptyFailLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(180);
      delete globalThis.__FAIL_DRAW__;
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence?.hasMap ?? false, false);
      assert.equal(env.doc.querySelector('#empty-state').hidden, false);
      assert.match(env.doc.querySelector('#shell-status').textContent, /^Open failed:/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_OWNERSHIP) {
      globalThis.window.__M5_P1B_TEST__.touch();
      await env.desktopOpen.click(); await settle(20);
      const ownPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
      await findAll(ownPrompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(180);
      const ownLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      assert.ok(ownLibrary); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.guard, true);
      const beforeTree = globalThis.window.__M5_EXPLORATION_STATUS__;
      globalThis.window.__M5_P1B_TEST__.delayNextOpen(150);
      await findAll(ownLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(25);
      const during = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(during.busy, 'loading'); assert.equal(during.guard, true);
      assert.equal(env.doc.querySelector('#undo-history').disabled, true);
      assert.equal(env.doc.querySelector('#redo-history').disabled, true);
      assert.equal(env.desktopSave.disabled, true); assert.equal(env.desktopOpen.disabled, true);
      await env.desktopCreate.click(); await settle(20);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'create-map-backdrop' && child.hidden === false), false);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, beforeTree.revision);
      assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeTree.totalCount);
      await settle(180);
      const after = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(after.guard, false); assert.equal(after.busy, null); assert.equal(after.mapId, savedStatus.mapId);
      assert.equal(env.doc.querySelector('#undo-history').disabled, true);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_OPEN_FAIL_RECOVERY) {
      await env.desktopOpen.click(); await settle(30);
      const recoveryLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      globalThis.window.__M5_P1B_TEST__.failFrame('open-saved-map', 'installHit');
      globalThis.window.__M5_P1B_TEST__.failFrame('recovery', 'labels');
      await findAll(recoveryLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(220);
      const recoveryStatus = globalThis.window.__M5_EXPLORATION_STATUS__;
      const recoverySnapshot = globalThis.window.__M5_P1B_TEST__.snapshot();
      const recoveryCounts = globalThis.window.__M5_P1B_TEST__.frameCounts();
      assert.ok(recoveryCounts['open-saved-map:installHit'] >= 1);
      assert.ok(recoveryCounts['recovery:labels'] >= 1);
      assert.equal(recoveryStatus.creationSuspended, true);
      assert.equal(recoveryStatus.editor.inert, true);
      assert.equal(recoverySnapshot.mapId, savedStatus.mapId);
      assert.equal(recoverySnapshot.dirty, false);
      assert.equal(recoverySnapshot.guard, false);
      const shell = env.doc.querySelector('#shell-status').textContent;
      assert.match(shell, /^Open failed: injected open-saved-map installHit callback failure/);
      assert.match(shell, /Recovery failed:/);
      assert.match(env.doc.querySelector('#details').textContent, /unavailable after recovery failure/);
      await env.desktopCreate.click(); await settle(20);
      assert.equal(env.overlayHost.children.some((child) => child.className === 'create-map-backdrop' && child.hidden === false), false);
      globalThis.window.__M5_P1B_TEST__.clearFrameFailures();
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    if (process.env.P1B_OPEN_FAIL_STAGE) {
      await env.desktopOpen.click(); await settle(30);
      const failStageLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      const beforeStageFailure = globalThis.window.__M5_EXPLORATION_STATUS__;
      const beforeUndoDisabled = env.doc.querySelector('#undo-history').disabled;
      globalThis.window.__M5_P1B_TEST__.failNextOpen(process.env.P1B_OPEN_FAIL_STAGE);
      await findAll(failStageLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(200);
      const failedStage = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(failedStage.hasMap, true); assert.equal(failedStage.mapId, savedStatus.mapId);
      assert.equal(failedStage.guard, false); assert.equal(failedStage.busy, null);
      assert.match(env.doc.querySelector('#shell-status').textContent, /^Open failed:/);
      if (process.env.P1B_OPEN_FAIL_STAGE !== 'load') {
        assert.match(env.doc.querySelector('#shell-status').textContent, /^Open failed:/);
        const counts = globalThis.window.__M5_P1B_TEST__.frameCounts();
        const candidateBoundary = process.env.P1B_OPEN_FAIL_STAGE === 'label' ? 'open-saved-map:labels' : 'open-saved-map:installHit';
        assert.ok(counts[candidateBoundary] >= 1, 'candidate boundary was not reached: ' + candidateBoundary);
        assert.equal(counts['open-saved-map:draw'], 1, 'candidate draw count');
        assert.equal(counts['recovery:draw'], 1, 'recovery draw count');
        assert.equal(counts['recovery:labels'], 1, 'recovery label count');
        assert.equal(counts['recovery:installHit'], 1, 'recovery hit count');
        assert.equal(counts['resize:draw'] || 0, 0, 'unexpected duplicate resize draw');
        assert.equal(counts['resize:labels'] || 0, 0, 'unexpected duplicate resize labels');
        assert.equal(counts['resize:installHit'] || 0, 0, 'unexpected duplicate resize hits');
        assert.match(env.doc.querySelector('#shell-status').textContent, new RegExp('injected open-saved-map ' + (process.env.P1B_OPEN_FAIL_STAGE === 'label' ? 'labels' : 'installHit') + ' callback failure'));
        assert.match(env.doc.querySelector('#details').textContent, /Browser Map/);
        const recoveredStatus = globalThis.window.__M5_EXPLORATION_STATUS__;
        assert.equal(recoveredStatus.structuralRootId, beforeStageFailure.structuralRootId);
        assert.equal(recoveredStatus.revision, beforeStageFailure.revision);
        assert.equal(recoveredStatus.totalCount, beforeStageFailure.totalCount);
        assert.deepEqual(recoveredStatus.camera, beforeStageFailure.camera);
        assert.equal(recoveredStatus.framingMode, beforeStageFailure.framingMode);
        assert.equal(recoveredStatus.focusedFolderId, beforeStageFailure.focusedFolderId);
        assert.equal(recoveredStatus.selectedId, beforeStageFailure.selectedId);
        assert.equal(recoveredStatus.detailsTargetId, beforeStageFailure.detailsTargetId);
        assert.equal(recoveredStatus.generation, beforeStageFailure.generation + 1);
        assert.equal(env.doc.querySelector('#undo-history').disabled, beforeUndoDisabled);
        assert.equal(recoveredStatus.hitActive, true);
        assert.ok(env.doc.querySelector('#label-host').children.length > 0);
        const restoredName = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'note.txt');
        const restoredLabel = restoredName.parent; const restoredRect = restoredLabel.getBoundingClientRect();
        await env.doc.querySelector('#label-host').dispatch('click', { target: restoredName, button: 0, clientX: restoredRect.left + restoredRect.width / 2, clientY: restoredRect.top + restoredRect.height / 2 });
        await settle(30);
        const viewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
        assert.ok(viewer, 'ordinary interaction after recovery did not open the viewer');
        await findAll(viewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
        const cameraBeforeNav = globalThis.window.__M5_EXPLORATION_STATUS__.camera;
        await findAll(env.graphHost, 'canvas')[0].dispatch('wheel', { deltaY: 120, clientX: 550, clientY: 236, preventDefault() {}, stopPropagation() {} });
        await settle(30);
        assert.notDeepEqual(globalThis.window.__M5_EXPLORATION_STATUS__.camera, cameraBeforeNav, 'navigation controller was not usable');
        globalThis.window.__M5_P1B_TEST__.openAddData(); await settle(30);
        const recoveryAddForm = env.doc.querySelector('#editor-form');
        const recoveryAddName = findAll(recoveryAddForm, 'input').find((input) => input.type === 'text'); recoveryAddName.value = 'after-recovery.pdf'; await recoveryAddName.dispatch('input');
        const recoveryAddDesc = findAll(recoveryAddForm, 'textarea')[0]; recoveryAddDesc.value = 'After recovery'; await recoveryAddDesc.dispatch('input');
        const recoveryAddType = findAll(recoveryAddForm, 'select')[0]; recoveryAddType.value = 'file'; await recoveryAddType.dispatch('change'); await settle(20);
        const recoveryAddFile = findAll(recoveryAddForm, 'input').find((input) => input.type === 'file'); recoveryAddFile.files = [syntheticFile('after-recovery.pdf', 'application/pdf', '%PDF after')]; await recoveryAddFile.dispatch('change'); await settle(60);
        const recoveryRevision = globalThis.window.__M5_EXPLORATION_STATUS__.revision;
        await recoveryAddForm.dispatch('submit', { preventDefault() {} }); await settle(160);
        assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, recoveryRevision + 1);
        globalThis.window.__M5_P1B_TEST__.clearFrameFailures();
      }
      return;
    }
    const emptyFixture = env.doc.querySelector('#fixture'); emptyFixture.value = ''; await emptyFixture.dispatch('change'); await settle(20);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
    await env.desktopOpen.click(); await settle(40);
    const emptyLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    assert.ok(emptyLibrary); assert.match(textOf(emptyLibrary), /Browser Map/);
    await findAll(emptyLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(160);
assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.hasMap, true);
    assert.ok(env.doc.querySelector('#label-host').children.length > 0);
    if (process.env.P1B_OPEN_FAIL_DRAW) {
      globalThis.window.__M5_P1B_TEST__.failFrame('open-saved-map', 'draw');
      await env.desktopOpen.click(); await settle(40);
      const failLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
      await findAll(failLibrary, 'button').find((button) => button.textContent === 'Open').click(); await settle(180);
      globalThis.window.__M5_P1B_TEST__.clearFrameFailures();
      const failedOpen = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
      assert.equal(failedOpen.hasMap, true); assert.equal(failedOpen.mapId, savedStatus.mapId);
      assert.match(env.doc.querySelector('#shell-status').textContent, /^Open failed:/);
      delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
      return;
    }
    globalThis.window.__M5_P1B_TEST__.touch();
    globalThis.window.__M5_P1B_TEST__.delayNextSave(90);
    await env.desktopSave.click(); await settle(20);
    globalThis.window.__M5_P1B_TEST__.touch();
    await settle(180);
    const editedDuringSave = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.equal(editedDuringSave.dirty, true);
    assert.equal(editedDuringSave.lastResult.wroteAttachmentCount, 0);
    assert.equal(editedDuringSave.mapId, savedStatus.mapId);
    await env.desktopSave.click(); await settle(160);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, false);
    globalThis.window.__M5_P1B_TEST__.touch();
    await env.desktopOpen.click(); await settle(20);
    const guardPrompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
    await findAll(guardPrompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(20);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.guard, true);
    assert.equal(env.desktopSave.disabled, true); assert.equal(env.desktopOpen.disabled, true);
    await settle(160);
    const guardPromptLater = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
    assert.equal(guardPromptLater.hidden, true);
    const guardLibrary = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    const beforeLibraryClose = globalThis.window.__M5_EXPLORATION_STATUS__;
    for (const fn of env.doc.listeners.get('keydown') || []) await fn({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); await settle(20);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.guard, false);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, savedStatus.mapId);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.revision, beforeLibraryClose.revision);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, beforeLibraryClose.totalCount);
    await env.desktopOpen.click(); await settle(100);
    let library = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    assert.ok(library); assert.equal(library.hidden, false);
    assert.match(textOf(library), /Browser Map/); assert.match(textOf(library), /Last saved/);
    await findAll(library, 'button').find((button) => button.textContent === 'Open').click(); await settle(140);
    const openStatus = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.equal(openStatus.mapId, savedStatus.mapId); assert.equal(openStatus.dirty, false);
    assert.ok(env.doc.querySelector('#label-host').children.length > 0);
    assert.match(env.doc.querySelector('#details').textContent, /Browser Map/);
    const restoredName = findAll(env.doc.querySelector('#label-host'), '[data-vd-name]').find((node) => node.textContent === 'note.txt');
    assert.ok(restoredName);
    const restoredLabel = restoredName.parent;
    const restoredRect = restoredLabel.getBoundingClientRect();
    await env.doc.querySelector('#label-host').dispatch('click', {
      target: restoredName, button: 0,
      clientX: restoredRect.left + restoredRect.width / 2,
      clientY: restoredRect.top + restoredRect.height / 2
    });
    await settle(40);
    const restoredViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
    assert.ok(restoredViewer, 'restored filename did not open the viewer');
    await findAll(restoredViewer, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
    assert.match(textOf(env.doc.querySelector('#label-host')), /note\.txt/);
    globalThis.window.__M5_P1B_TEST__.touch();
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.dirty, true);
    assert.equal(env.desktopSave.dataset.available, 'true');
    await env.desktopOpen.click(); await settle(20);
    let prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
    assert.ok(prompt); assert.equal(prompt.hidden, false);
    await findAll(prompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId, savedStatus.mapId);
    await env.desktopOpen.click(); await settle(20);
    prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
    await findAll(prompt, 'button').find((button) => button.textContent === 'Save and continue').click(); await settle(180);
    const continued = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.equal(continued.dirty, false); assert.ok(continued.generation > savedStatus.generation);
    library = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    assert.ok(library); assert.equal(library.hidden, false);
    await findAll(library, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
    await env.desktopCreate.click(); await settle(20);
    const createAgain = env.overlayHost.children.find((child) => child.className === 'create-map-backdrop');
    if (createAgain && createAgain.hidden === false) { await findAll(createAgain.children[0], 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20); }
    prompt = env.overlayHost.children.find((child) => child.className === 'unsaved-map-backdrop');
    if (prompt && prompt.hidden === false) {
      await findAll(prompt, 'button').find((button) => button.textContent === 'Cancel').click(); await settle(20);
    }
    await env.desktopOpen.click(); await settle(100);
    library = env.overlayHost.children.find((child) => child.className === 'saved-maps-backdrop');
    await findAll(library, 'button').find((button) => button.textContent === 'Delete saved map').click();
    await findAll(library, 'button').filter((button) => button.textContent === 'Delete saved map').pop().click(); await settle(180);
    const deletedStatus = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.equal(deletedStatus.hasMap, true); assert.equal(deletedStatus.mapId, null); assert.equal(deletedStatus.dirty, true);
    assert.match(textOf(library), /No saved maps/);
    await findAll(library, 'button').find((button) => button.textContent === 'Close').click(); await settle(20);
    globalThis.window.__M5_P1B_TEST__.touch();
    await env.desktopSave.click(); await settle(160);
    assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.persistence.mapId);
    globalThis.window.__M5_P1B_TEST__.touch();
    globalThis.window.__M5_P1B_TEST__.delayNextSave(120);
    await env.desktopSave.click(); await settle(20);
    const fixture = env.doc.querySelector('#fixture'); fixture.value = 'f20'; await fixture.dispatch('change');
    await settle(220);
    const replacementStatus = globalThis.window.__M5_EXPLORATION_STATUS__.persistence;
    assert.equal(replacementStatus.hasMap, true);
    assert.equal(replacementStatus.mapId, null);
    assert.equal(replacementStatus.dirty, true);
    delete globalThis.document; delete globalThis.window; delete globalThis.IndexedDB; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  const empty = env.doc.querySelector('#empty-state');
  assert.equal(empty.hidden, false);
  assert.equal(env.graphHost.hidden, true);
  assert.equal(env.doc.querySelector('#search-reserved').disabled, true);
  assert.equal(env.graphHost.clientWidth, 0);
  assert.equal(env.doc.querySelector('#graph-wrap').clientWidth, 1100);
  assert.equal(env.doc.querySelector('#graph-wrap').clientHeight, 473);
  assert.equal(env.doc.querySelector('#fit').disabled, true);
  assert.equal(env.doc.querySelector('#undo-history').disabled, true);
  await env.doc.querySelector('#theme-action').click();
  await env.doc.querySelector('#fullscreen-action').click();
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
  const emptyCreate = findAll(empty, 'button')[0];
  await emptyCreate.click();
  let overlays = env.overlayHost.children.filter((child) => child.className === 'create-map-backdrop');
  assert.equal(overlays[0].hidden, false);
  let dialog = overlays[0].children[0];
  const emptyCancel = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await emptyCancel.click();
  assert.equal(empty.hidden, false);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
  assert.ok((env.desktopCreate.listeners.get('click') || []).length > 0, 'desktop listener missing');
  if (process.env.FAIL_CREATE_INSTALL) {
    await env.desktopCreate.click();
    overlays = env.overlayHost.children.filter((child) => child.className === 'create-map-backdrop');
    dialog = overlays[0].children[0];
    const failureName = findAll(dialog, 'input').find((input) => input.type === 'text'); failureName.value = 'Fail Map';
    const failureFile = findAll(dialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
    failureFile.files = [syntheticFile('x.txt', 'text/plain', 'x')]; await failureFile.dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 30));
    globalThis.__FAIL_DRAW__ = true;
    await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click();
    await new Promise((resolve) => setTimeout(resolve, 40));
    delete globalThis.__FAIL_DRAW__;
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
    assert.equal(empty.hidden, false);
    assert.doesNotMatch(env.doc.querySelector('#shell-status').textContent, /previous frame could not be restored/);
    assert.match(env.doc.querySelector('#shell-status').textContent, /^Create Map failed\./);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.ZERO_VIEWPORT) {
    await env.desktopCreate.click();
    overlays = env.overlayHost.children.filter((child) => child.className === 'create-map-backdrop');
    dialog = overlays[0].children[0];
    const zeroName = findAll(dialog, 'input').find((input) => input.type === 'text'); zeroName.value = 'Zero Map';
    const zeroFile = findAll(dialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
    zeroFile.files = [syntheticFile('x.txt', 'text/plain', 'x')]; await zeroFile.dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const graphWrap = env.doc.querySelector('#graph-wrap');
    graphWrap._clientWidth = 0; graphWrap._clientHeight = 0; const zeroViewport = env.doc.querySelector('#graph-viewport'); zeroViewport._clientWidth = 0; zeroViewport._clientHeight = 0;
    await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(overlays[0].hidden, false);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hasMap, false);
    assert.match(dialog.querySelector('.create-map-status').textContent, /graph area is not visible/i);
    const zeroCreate = findAll(dialog, 'button').find((button) => button.textContent === 'Create Map');
    const zeroReplace = findAll(dialog, 'button').find((button) => button.textContent === 'Replace map');
    const zeroBack = findAll(dialog, 'button').find((button) => button.textContent === 'Back');
    assert.equal(zeroCreate.disabled, false);
    assert.equal(zeroReplace.disabled, true);
    assert.equal(zeroBack.disabled, true);
    graphWrap._clientWidth = 1100; graphWrap._clientHeight = 473; const restoreViewport = env.doc.querySelector('#graph-viewport'); restoreViewport._clientWidth = 1100; restoreViewport._clientHeight = 431;
    await findAll(dialog, 'button').find((button) => button.textContent === 'Create Map').click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2); const zeroCanvas = env.graphHost.children.filter((child) => child.tagName === 'CANVAS').at(-1); assert.equal(zeroCanvas.style.height, '431px'); assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.fitProjection.height, 431);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  await env.desktopCreate.click();
  overlays = env.overlayHost.children.filter((child) => child.className === 'create-map-backdrop');
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].hidden, false);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.editor.creationOwned, true);
  dialog = overlays[0].children[0];
  const name = findAll(dialog, 'input').find((input) => input.type === 'text');
  name.value = 'Map';
  const fileInput = findAll(dialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
  fileInput.files = [syntheticFile('Notes.md', 'text/markdown', '# Notes', 'Docs/Notes.md'), syntheticFile('keep.txt', 'text/plain', 'keep', 'Other/keep.txt')]; await fileInput.dispatch('change');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(findAll(dialog, 'p').map((p) => p.textContent).join(' '), /files/);
  const form = dialog.querySelector('.create-map-form'); const preview = dialog.querySelector('.create-map-preview'); const actions = dialog.querySelector('.create-map-actions'); const confirmStage = dialog.querySelector('.create-map-confirm');
  assert.equal(form.hidden, false); assert.equal(preview.hidden, false); assert.equal(actions.hidden, false); assert.equal(confirmStage.hidden, true);
  assert.ok(findAll(dialog, '.create-map-row').length > 0);
  const createMap = findAll(dialog, 'button').find((button) => button.textContent === 'Create Map'); await createMap.click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 5);
  const surfaceCanvas = env.graphHost.children.find((child) => child.tagName === 'CANVAS');
  assert.ok(surfaceCanvas && surfaceCanvas.width > 0);
  assert.equal(surfaceCanvas.width, 1100);
  const labelHostAfterCreate = env.doc.querySelector('#label-host');
  assert.equal(labelHostAfterCreate.hidden, false);
  assert.notEqual(labelHostAfterCreate.style.visibility, 'hidden');
  const initialLabels = findAll(labelHostAfterCreate, 'div').filter((node) => node.getAttribute('data-vd-label-id'));
  assert.ok(initialLabels.length > 0);
  const initialLabelText = initialLabels.map(textOf).join(' | ');
  assert.match(initialLabelText, /Map/);
  assert.match(initialLabelText, /Docs/);
  assert.match(initialLabelText, /Notes\.md/);
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.viewport.width > 0);
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.viewport.height > 0);
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.unmeasurableCount, 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.textMismatchCount, 0);
  const notesLabel = initialLabels.find((group) => textOf(group).includes('Notes.md'));
  assert.ok(notesLabel);
  const notesName = notesLabel.__vdNameText;
  const notesRect = notesLabel.getBoundingClientRect();
  await labelHostAfterCreate.dispatch('click', { button: 0, target: notesName, clientX: notesRect.left + 5, clientY: notesRect.top + 5 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, notesLabel.getAttribute('data-vd-label-id'));
  const initialViewer = findAll(env.doc.body, '.attachment-viewer-backdrop').find((node) => node.hidden === false);
  assert.ok(initialViewer);
  const closeInitial = findAll(initialViewer, 'button').find((button) => button.textContent === 'Close'); await closeInitial.click();
  assert.equal(initialViewer.hidden, true);
  if (process.env.BUTTON_LIFECYCLE) {
    const tokenBefore = globalThis.window.__M5_EXPLORATION_STATUS__.datasetToken;
    await env.desktopCreate.click();
    let lifecycleDialog = overlays[0].children[0];
    const lifecycleBack = findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Back');
    const lifecycleReplace = findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Replace map');
    assert.equal(lifecycleBack.disabled, true);
    assert.equal(lifecycleReplace.disabled, true);
    await lifecycleReplace.click();
    assert.equal(overlays[0].hidden, false);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.datasetToken, tokenBefore);
    const secondName = findAll(lifecycleDialog, 'input').find((input) => input.type === 'text');
    const secondFile = findAll(lifecycleDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
    secondFile.files = [syntheticFile('Invalid.md', 'text/markdown', '# Invalid', 'Invalid.md')]; await secondFile.dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 40));
    let lifecycleCreate = findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Create Map');
    assert.equal(lifecycleCreate.disabled, true);
    assert.equal(lifecycleDialog.querySelector('.create-map-status').dataset.kind, 'error');
    secondName.value = 'Second Map';
    secondFile.files = [syntheticFile('Second.md', 'text/markdown', '# Second', 'Second.md')]; await secondFile.dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 100));
    lifecycleCreate = findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Create Map');
    assert.equal(lifecycleCreate.disabled, false);
    await lifecycleBack.click();
    assert.equal(lifecycleDialog.querySelector('.create-map-confirm').hidden, true);
    assert.equal(lifecycleDialog.querySelector('.create-map-form').hidden, false);
    assert.ok(findAll(lifecycleDialog, '.create-map-row').length > 0);
    assert.equal(lifecycleCreate.disabled, false);
    await lifecycleCreate.click();
    assert.equal(lifecycleReplace.disabled, false);
    const firstSubmit = lifecycleReplace.click(); const secondSubmit = lifecycleReplace.click(); await Promise.all([firstSubmit, secondSubmit]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(overlays[0].hidden, true);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.datasetToken, tokenBefore + 1);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
    const replacementLabels = findAll(env.doc.querySelector('#label-host'), 'div').filter((node) => node.getAttribute('data-vd-label-id'));
    const replacementText = replacementLabels.map(textOf).join(' | ');
    assert.match(replacementText, /Second Map/);
    assert.match(replacementText, /Second\.md/);
    assert.doesNotMatch(replacementText, /Notes\.md/);
    assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.unmeasurableCount, 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.textMismatchCount, 0);
    assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.viewport.width > 0);
    assert.match(env.doc.querySelector('#shell-status').textContent, /Download started|cannot confirm|Created and saved|Saved/);
    await env.desktopCreate.click();
    lifecycleDialog = overlays[0].children[0];
    assert.equal(findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Create Map').disabled, true);
    assert.equal(findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Replace map').disabled, true);
    const reopenCancel = findAll(lifecycleDialog, 'button').find((button) => button.textContent === 'Cancel');
    assert.equal(reopenCancel.disabled, false);
    await reopenCancel.click();
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.datasetToken, tokenBefore + 1);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.totalCount, 2);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.FAIL_RESTORE) {
  await env.desktopCreate.click();
    globalThis.__FAIL_DRAW__ = true;
    const failCancel = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await failCancel.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    delete globalThis.__FAIL_DRAW__;
    assert.equal(env.graphHost.hidden, true);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, false);
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.editor.inert, true);
    assert.match(env.doc.querySelector('#shell-status').textContent, /could not be restored/);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  env.mapMenu.hidden = false; await env.mobileCreate.click();
  assert.equal(overlays[0].hidden, false);
  const cancel2 = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await cancel2.click();
  assert.equal(overlays[0].hidden, true);
  const searchInput = env.doc.querySelector('#search-reserved');
  searchInput.value = 'Notes.md'; await searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(findAll(env.doc.body, '.search-card').length > 0);
  const searchCamera = JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera);
  const searchDetails = globalThis.window.__M5_EXPLORATION_STATUS__.detailsTargetId;
  const searchFocus = globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId;
  if (env.doc.documentElement.getAttribute('data-theme') !== 'dark') await env.doc.querySelector('#theme-action').click();
  globalThis.__CANVAS_COLORS__ = [];
  await env.desktopCreate.click();
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.creationSuspended, true);
  assert.equal(env.graphHost.hidden, true);
  assert.equal(env.doc.querySelector('#label-host').hidden, true);
  assert.equal(env.doc.querySelector('#details').hidden, true);
  assert.equal(env.doc.querySelector('#search-results-host').hidden, true);
  await env.doc.querySelector('#theme-action').click();
  assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'light');
  globalThis.window.dispatch('resize');
  assert.equal(env.graphHost.hidden, true);
  const resizeWrap = env.doc.querySelector('#graph-wrap'); resizeWrap._clientWidth = 900; resizeWrap._clientHeight = 400; const resizeViewport = env.doc.querySelector('#graph-viewport'); resizeViewport._clientWidth = 900; resizeViewport._clientHeight = 358;
  globalThis.window.dispatch('resize');
  assert.equal(env.graphHost.hidden, true);
  const cancelExisting = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await cancelExisting.click();
  assert.equal(env.graphHost.hidden, false);
  assert.equal(env.graphHost.children.filter((child) => child.tagName === 'CANVAS').at(-1).width, 900);
  assert.equal(searchInput.value, 'Notes.md');
  assert.ok(findAll(env.doc.body, '.search-card').length > 0);
  assert.notEqual(JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera), searchCamera);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId, searchFocus);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.detailsTargetId, searchDetails);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, true);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, true);
  assert.ok(globalThis.__CANVAS_COLORS__.includes('#f8fafc'));
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.viewport.width > 0);
  assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.visibleCount > 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.unmeasurableCount, 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.labelMetrics.textMismatchCount, 0);
  const restoredLabels = findAll(env.doc.querySelector('#label-host'), 'div').filter((node) => node.getAttribute('data-vd-label-id'));
  assert.ok(restoredLabels.some((group) => textOf(group).includes('Notes.md')));
  globalThis.__CANVAS_COLORS__ = [];
  await env.desktopCreate.click();
  await env.doc.querySelector('#theme-action').click();
  assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'dark');
  const cancelDark = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await cancelDark.click();
  assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, true);
  assert.ok(globalThis.__CANVAS_COLORS__.length > 0);
  assert.equal(globalThis.__CANVAS_COLORS__.includes('#f8fafc'), false);
  const unchangedCamera = JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera);
  await env.desktopCreate.click();
  const unchangedCancel = findAll(dialog, 'button').find((button) => button.textContent === 'Cancel'); await unchangedCancel.click();
  assert.equal(JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera), unchangedCamera);
  assert.equal(env.graphHost.children.filter((child) => child.tagName === 'CANVAS').at(-1).width, 900);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.linkReady, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  searchInput.value = 'Notes.md'; await searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const notesCard = findAll(env.doc.body, '.search-card')[0];
  assert.ok(notesCard);
  await notesCard.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, notesCard.dataset.id);
  const viewer = findAll(env.doc.body, '.attachment-viewer-backdrop')[0];
  assert.ok(viewer); assert.equal(viewer.hidden, false);
  const closeViewer = findAll(viewer, 'button').find((button) => button.textContent === 'Close'); await closeViewer.click();
  assert.equal(viewer.hidden, true);
  const cameraBefore = JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera);
  const focusBefore = globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId;
  const clearSearch = findAll(env.doc.body, 'button').find((button) => button.textContent === 'Clear search'); await clearSearch.click();
  assert.equal(searchInput.value, '');
  assert.equal(findAll(env.doc.body, '.search-card').length, 0);
  assert.equal(JSON.stringify(globalThis.window.__M5_EXPLORATION_STATUS__.camera), cameraBefore);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId, focusBefore);
  globalThis.window.matchMedia = () => ({ matches: false });
  let rafClock = 0; let rafId = 0; let rafQueue = [];
  Object.defineProperty(globalThis, 'performance', { value: { now: () => rafClock }, configurable: true });
  globalThis.requestAnimationFrame = (cb) => { const id = ++rafId; rafQueue.push({ id, cb }); return id; };
  globalThis.cancelAnimationFrame = (id) => { rafQueue = rafQueue.filter((item) => item.id !== id); };
  const advance = async (ms) => { rafClock += ms; const batch = rafQueue; rafQueue = []; for (const item of batch) item.cb(rafClock); await new Promise((resolve) => setTimeout(resolve, 0)); };
  globalThis.URL = class extends URL { static createObjectURL() { return 'blob:motion-pdf'; } static revokeObjectURL() {} };
  await env.desktopCreate.click();
  const motionDialog = overlays[0].children[0];
  const motionName = findAll(motionDialog, 'input').find((input) => input.type === 'text'); motionName.value = 'Motion Map';
  const motionFile = findAll(motionDialog, 'input').find((input) => input.type === 'file' && input.multiple && !input.hasAttribute('webkitdirectory'));
  motionFile.files = [syntheticFile('Report.pdf', 'application/pdf', '%PDF-1.4 motion', 'Docs/Report.pdf'), syntheticFile('keep2.txt', 'text/plain', 'keep', 'Other2/keep2.txt')]; await motionFile.dispatch('change');
  await new Promise((resolve) => setTimeout(resolve, 30));
  await findAll(motionDialog, 'button').find((button) => button.textContent === 'Create Map').click();
  assert.equal(motionDialog.querySelector('.create-map-confirm').hidden, false);
  assert.equal(motionDialog.querySelector('.create-map-form').hidden, true);
  assert.equal(motionDialog.querySelector('.create-map-preview').hidden, true);
  assert.equal(motionDialog.querySelector('.create-map-actions').hidden, true);
  await findAll(motionDialog, 'button').find((button) => button.textContent === 'Replace map').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const motionLabels = findAll(env.doc.querySelector('#label-host'), 'div').filter((node) => node.getAttribute('data-vd-label-id'));
  const pdfLabel = motionLabels.find((group) => textOf(group).includes('Report.pdf'));
  const textLabel = motionLabels.find((group) => textOf(group).includes('keep2.txt'));
  assert.ok(pdfLabel); assert.ok(textLabel);
  assert.equal(pdfLabel.children.some((child) => String(child.tagName).toLowerCase() === 'svg'), false);
  assert.equal(textLabel.children.some((child) => String(child.tagName).toLowerCase() === 'svg'), false);
  assert.equal(pdfLabel.__vdBadge.textContent, 'PDF');
  assert.equal(textLabel.__vdBadge.textContent, 'TXT');
  searchInput.value = 'Other2'; await searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const other2Card = findAll(env.doc.body, '.search-card')[0]; assert.ok(other2Card);
  await other2Card.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(rafQueue.length > 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.lastClickDiagnostic.reason, 'transition-in-progress');
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, null);
  await advance(100);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.transition?.active, true);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, false);
  await advance(250); await advance(430);
  await advance(0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId, other2Card.dataset.id);
  searchInput.value = 'Report.pdf'; await searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const pdfCard = findAll(env.doc.body, '.search-card')[0]; assert.ok(pdfCard);
  const pdfId = pdfCard.dataset.id;
  if (process.env.MOTION_FAILURE === 'draw') {
    await pdfCard.click(); await new Promise((resolve) => setTimeout(resolve, 0)); await advance(100);
    globalThis.__FAIL_DRAW__ = true; await advance(250);
    delete globalThis.__FAIL_DRAW__;
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId === pdfId, false);
    assert.equal(findAll(env.doc.body, '.attachment-viewer-backdrop').filter((node) => node.hidden === false).length, 0);
    assert.ok(globalThis.window.__M5_EXPLORATION_STATUS__.error || globalThis.window.__M5_EXPLORATION_STATUS__.lastClickDiagnostic?.error);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  if (process.env.MOTION_FAILURE === 'resize') {
    await pdfCard.click(); await new Promise((resolve) => setTimeout(resolve, 0)); await advance(100);
    globalThis.window.dispatch('resize');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId === pdfId, false);
    assert.equal(findAll(env.doc.body, '.attachment-viewer-backdrop').filter((node) => node.hidden === false).length, 0);
    searchInput.value = 'keep2.txt'; await searchInput.dispatch('input');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const keepCard = findAll(env.doc.body, '.search-card')[0]; assert.ok(keepCard);
    await keepCard.click(); await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(keepCard.dataset.id, 'cm-2-4');
    return;
  }
  if (process.env.MOTION_FAILURE === 'dataset') {
    await pdfCard.click(); await new Promise((resolve) => setTimeout(resolve, 0)); await advance(100);
    const fixture = env.doc.querySelector('#fixture'); fixture.value = 'f200'; await fixture.dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await pdfCard.click(); await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId === pdfId, false);
    assert.equal(findAll(env.doc.body, '.attachment-viewer-backdrop').filter((node) => node.hidden === false).length, 0);
    delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    return;
  }
  await pdfCard.click(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(rafQueue.length > 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.lastClickDiagnostic.reason, 'transition-in-progress');
  await advance(100);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.transition?.active, true);
  assert.notEqual(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, pdfId);
  assert.equal(findAll(env.doc.body, '.attachment-viewer-backdrop').filter((node) => node.hidden === false).length, 0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, false);
  await advance(250); await advance(430); await advance(0);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, pdfId);
  assert.notEqual(globalThis.window.__M5_EXPLORATION_STATUS__.focusedFolderId, other2Card.dataset.id);
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.hitActive, true);
  const pdfViewers = findAll(env.doc.body, '.attachment-viewer-backdrop').filter((node) => node.hidden === false);
  assert.equal(pdfViewers.length, 1);
  assert.ok(findAll(pdfViewers[0], 'iframe').length > 0);
  const closePdf = findAll(pdfViewers[0], 'button').find((button) => button.textContent === 'Close'); await closePdf.click();
  const fixture = env.doc.querySelector('#fixture'); fixture.value = 'f200'; await fixture.dispatch('change');
  await new Promise((resolve) => setTimeout(resolve, 20));
  searchInput.value = 'Node 156'; await searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const dataCard = findAll(env.doc.body, '.search-card')[0];
  assert.ok(dataCard); assert.equal(dataCard.dataset.id, 'n156');
  await dataCard.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(globalThis.window.__M5_EXPLORATION_STATUS__.selectedId, dataCard.dataset.id);
  delete globalThis.document; delete globalThis.window; delete globalThis.ResizeObserver; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  return;
}

await run();


















































































































































