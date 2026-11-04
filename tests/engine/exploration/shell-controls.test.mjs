import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createActionButtonsController,
  createPopupMenu,
  createThemeController,
  createFullscreenController,
  createInteractionOwnership,
  resolveFocusFallback,
  themedCanvasScene,
  createHistoryToolbarController,
  THEME_DARK,
  THEME_LIGHT
} from '../../harness/m5-exploration/shell-controls.js';

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = { ...dataset };
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this._textContent = '';
    this.className = '';
    this.tagName = 'DIV';
    this.style = {};
  }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { const list = this.listeners.get(type) || []; this.listeners.set(type, list.filter((item) => item !== fn)); }
  async click() { for (const fn of [...(this.listeners.get('click') || [])]) await fn({ currentTarget: this }); }
  focus() { this.focused = true; }
  contains(target) { return target === this || this.children.includes(target) || this.children.some((child) => child.contains?.(target)); }
  getBoundingClientRect() { return this.rect || { left: 8, bottom: 40, width: 0, height: 0 }; }
  querySelector(selector) {
    if (selector === '.sidebar-label') {
      const direct = this.children.find((child) => child.className === 'sidebar-label');
      if (direct) return direct;
      for (const child of this.children) { const found = child.querySelector?.(selector); if (found) return found; }
      return null;
    }
    if (selector === 'button:not([disabled])') return this.children.find((child) => child.tagName === 'BUTTON' && child.disabled !== true) || null;
  }
}
function labelChild() { const span = new FakeElement(); span.className = 'sidebar-label'; return span; }
function actionSetup() {
  const available = new FakeElement({ action: 'embed', available: 'false', label: 'Embed' });
  const unavailable = new FakeElement({ action: 'create-map', available: 'false', label: 'Create Map' });
  const actions = []; const unavailableCalls = [];
  const controller = createActionButtonsController({ buttons: [available, unavailable], onAction: (action) => actions.push(action.action), onUnavailable: (action) => unavailableCalls.push(action.action) });
  return { available, unavailable, actions, unavailableCalls, controller };
}
test('desktop and responsive action buttons share one execution path and preserve unavailable states', async () => {
  const s = actionSetup();
  await s.available.click();
  assert.deepEqual(s.unavailableCalls, ['embed']);
  assert.deepEqual(s.actions, []);
  s.available.dataset.available = 'true';
  await s.available.click();
  assert.deepEqual(s.actions, ['embed']);
  assert.equal((s.available.listeners.get('click') || []).length, 1);
});
test('Map menu clamps, closes on Escape/outside, restores focus, and removes listeners', async () => {
  const document = { documentElement: { clientWidth: 320, clientHeight: 240 }, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); } };
  const button = new FakeElement(); button.rect = { left: 300, bottom: 40, width: 20, height: 20 };
  const menu = new FakeElement(); menu.rect = { width: 160, height: 100 };
  const item = new FakeElement(); item.tagName = 'BUTTON'; menu.children = [item];
  const popup = createPopupMenu({ document, button, menu });
  popup.show();
  assert.equal(menu.hidden, false);
  assert.equal(menu.style.maxHeight, '224px'); assert.equal(menu.style.overflowY, 'auto');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(item.focused, true);
  assert.ok(Number.parseFloat(menu.style.left) <= 152);
  document.listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
  assert.equal(menu.hidden, true);
  assert.equal(button.focused, true);
  popup.show();
  document.listeners.get('pointerdown')({ target: new FakeElement() });
  assert.equal(menu.hidden, true);
  popup.destroy();
  assert.equal(document.listeners.size, 0);
});test('theme toggles tokens and themed canvas presentation without replacing DOM nodes', async () => {
  const document = { documentElement: new FakeElement() };
  const button = new FakeElement(); button.children = [labelChild()];
  const input = new FakeElement(); input.value = 'dirty draft';
  const controller = createThemeController({ document, button });
  assert.equal(controller.theme, THEME_DARK);
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  await button.click();
  assert.equal(controller.theme, THEME_LIGHT);
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(input.value, 'dirty draft');
  const scene = { presentation: { background: '#0b0e14', edgeStroke: '#454B54', rootFill: '#F8FAFC', rootStroke: '#F8FAFC', folderFill: '#B8BEC7', folderStroke: '#D1D5DB' }, nodes: new Map() };
  const light = themedCanvasScene(scene, THEME_LIGHT);
  assert.equal(light.presentation.background, '#f8fafc');
  assert.equal(light.presentation.rootFill, '#0f172a');
  assert.equal(scene.presentation.background, '#0b0e14');
});
test('fullscreen success, rejection, and fullscreenchange update state and status', async () => {
  const document = { fullscreenEnabled: true, fullscreenElement: null, documentElement: new FakeElement(), listeners: new Map(),
    addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener() {},
    async exitFullscreen() { this.fullscreenElement = null; this.listeners.get('fullscreenchange')?.(); } };
  const element = { async requestFullscreen() { document.fullscreenElement = element; document.listeners.get('fullscreenchange')?.(); } };
  const button = new FakeElement(); button.children = [labelChild()];
  const statuses = [];
  const controller = createFullscreenController({ document, element, button, onStatus: (message) => statuses.push(message) });
  assert.equal(controller.supported, true);
  await button.click();
  assert.equal(controller.active, true);
  assert.equal(button.getAttribute('aria-label'), 'Exit fullscreen');
  await button.click();
  assert.equal(controller.active, false);
  assert.match(statuses.at(-1), /exited/);
  element.requestFullscreen = async () => { throw new Error('denied'); };
  await button.click();
  assert.match(statuses.at(-1), /failed: denied/);
});
test('fullscreen unsupported state is honest', () => {
  const document = { fullscreenEnabled: false, documentElement: new FakeElement(), addEventListener() {}, removeEventListener() {} };
  const button = new FakeElement();
  const controller = createFullscreenController({ document, element: {}, button });
  assert.equal(controller.supported, false);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.match(button.getAttribute('title'), /not supported/);
});
test('harness shell has two top rows, no sidebar, and app-owned overlay/fullscreen hosts', () => {
  const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
  const actionToolbar = html.slice(html.indexOf('id="graph-action-toolbar"'), html.indexOf('id="graph-viewport"'));
  const header = html.slice(html.indexOf('id="app-header"'), html.indexOf('</header>') + '</header>'.length);
  assert.match(actionToolbar, /id="search-reserved"[^>]*maxlength="200"/);
  assert.doesNotMatch(actionToolbar, /id="search-reserved"[^>]*disabled/);
  assert.match(actionToolbar, /id="search-toggle"[^>]*aria-controls="search-panel"/);
  assert.match(actionToolbar, /id="search-panel"[^>]*hidden/);
  assert.match(actionToolbar, /id="search-close"[^>]*aria-label="Close search"/);
  assert.match(actionToolbar, /id="undo-history"[\s\S]*?id="redo-history"[\s\S]*?id="embed-action"[\s\S]*?id="fullscreen-action"[\s\S]*?id="download-backup"/);
  for (const id of ['search-toggle', 'undo-history', 'redo-history', 'embed-action', 'fullscreen-action', 'download-backup']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  assert.doesNotMatch(html, /id="app-sidebar"|sidebar-toggle|\.sidebar-label/);
  assert.match(html, /<nav id="nav-rail"[\s\S]*?id="theme-action"[^>]*data-presentation="text"/);
  assert.match(html, /id="fullscreen-action"[^>]*data-presentation="icon"/);
  assert.doesNotMatch(html, /id="theme-mobile"/);
  assert.equal((html.match(/data-action="create-map"[^>]*data-available="true"/g) || []).length, 2);
  assert.match(source, /if \(action === 'create-map'\) \{ startCreateMap\(\); return; \}/);
  const nav = html.slice(html.indexOf('<nav id="nav-rail"'), html.indexOf('</nav>') + 6);
  assert.ok(nav.indexOf('data-action="create-map"') < nav.indexOf('id="open-orbit-action"'));
  assert.ok(nav.indexOf('id="open-orbit-action"') < nav.indexOf('data-action="save-document-as"'));
  assert.ok(nav.indexOf('data-action="save-document-as"') < nav.indexOf('id="orbit-toggle"'));
  assert.ok(nav.indexOf('id="orbit-toggle"') < nav.indexOf('id="settings-action"'));
  assert.ok(nav.indexOf('id="theme-action"') > nav.indexOf('id="settings-action"'));
  assert.equal(nav.includes('data-action="open-map"'), false);
  assert.doesNotMatch(header, /data-action="(create-map|open-document|save-document-as|save-map|upload|download|open-map)"|Embed|fullscreen-action|search-toggle/);
  assert.match(source, /element: appRoot/);
  const appRootStart = html.indexOf('id="app-root"');
  const overlayIndex = html.indexOf('id="overlay-host"');
  const appRootEnd = html.lastIndexOf('</div>', html.indexOf('<pre id="status"'));
  assert.ok(overlayIndex > appRootStart && overlayIndex < appRootEnd);
  assert.equal((html.match(/id="overlay-host"/g) || []).length, 1);
  assert.ok(html.indexOf('id="fullscreen-action"' ) > html.indexOf('id="graph-wrap"'));
  assert.ok(html.indexOf('id="graph-action-toolbar"' ) > html.indexOf('id="app-header"'));
});test('toolbar Undo/Redo sync availability, accessible labels, guarded invocation, and history retention', async () => {
  const undo = new FakeElement(); const redo = new FakeElement();
  let blocked = false;
  const calls = [];
  let history = { undo: [{ action: 'Delete Data' }], redo: [] };
  const controller = createHistoryToolbarController({ undoButton: undo, redoButton: redo, getHistory: () => history, getBlockedReason: () => blocked, run: (direction) => calls.push(direction) });
  controller.sync();
  assert.equal(undo.disabled, false);
  assert.equal(redo.disabled, true);
  assert.equal(undo.textContent, 'Undo');
  assert.equal(undo.getAttribute('aria-label'), 'Undo: Delete Data');
  await undo.click();
  assert.deepEqual(calls, ['undo']);
  blocked = true;
  controller.sync();
  assert.equal(undo.disabled, true);
  assert.equal(redo.disabled, true);
  blocked = false;
  history = { undo: [], redo: [{ action: 'Add Data' }] };
  controller.sync();
  assert.equal(undo.disabled, true);
  assert.equal(redo.disabled, false);
  assert.equal(redo.getAttribute('aria-label'), 'Redo: Add Data');
  assert.equal(history.undo.length, 0);
});
function iconOnlyFixture(action) {
  const button = new FakeElement({ action, presentation: 'icon' });
  const svg = new FakeElement(); svg.tagName = 'svg';
  const path = new FakeElement(); path.tagName = 'path';
  const circle = new FakeElement(); circle.tagName = 'circle';
  svg.children = [path, circle];
  button.children = [svg];
  return { button, svg, path, circle };
}
test('icon-only desktop Theme/Fullscreen preserve SVG identity and synchronize mobile text', async () => {
  const theme = iconOnlyFixture('theme');
  const fullscreen = iconOnlyFixture('fullscreen');
  const themeMobile = new FakeElement({ presentation: 'text' });
  const fullscreenMobile = new FakeElement({ presentation: 'text' });
  const document = { fullscreenEnabled: true, fullscreenElement: null, documentElement: new FakeElement(), listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); }, async exitFullscreen() { this.fullscreenElement = null; this.listeners.get('fullscreenchange')?.(); } };
  const main = { async requestFullscreen() { document.fullscreenElement = main; document.listeners.get('fullscreenchange')?.(); } };
  const syncThemeMobile = (value) => { const label = value === THEME_DARK ? 'Theme: Light' : 'Theme: Dark'; themeMobile.textContent = label; themeMobile.setAttribute('aria-label', value === THEME_DARK ? 'Switch to light theme' : 'Switch to dark theme'); };
  const syncFullscreenMobile = ({ active }) => { fullscreenMobile.textContent = active ? 'Exit Fullscreen' : 'Fullscreen'; fullscreenMobile.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); };
  const themeController = createThemeController({ document, button: theme.button, onChange: syncThemeMobile });
  const fullscreenController = createFullscreenController({ document, element: main, button: fullscreen.button, onState: syncFullscreenMobile });
  assert.deepEqual(theme.button.children, [theme.svg]);
  assert.deepEqual(fullscreen.button.children, [fullscreen.svg]);
  assert.equal(theme.svg.children[0], theme.path);
  assert.equal(theme.svg.children[1], theme.circle);
  assert.equal(theme.button.textContent, '');
  assert.equal(themeMobile.textContent, 'Theme: Light');
  assert.equal(fullscreenMobile.textContent, 'Fullscreen');
  for (let i = 0; i < 3; i += 1) await theme.button.click();
  assert.equal(theme.button.children[0], theme.svg);
  assert.equal(theme.svg.children[0], theme.path);
  assert.equal(theme.svg.children[1], theme.circle);
  assert.equal(theme.button.textContent, '');
  assert.equal(themeController.theme, THEME_LIGHT);
  assert.equal(themeMobile.textContent, 'Theme: Dark');
  assert.equal(theme.button.getAttribute('aria-label'), 'Switch to dark theme');
  assert.equal(theme.button.getAttribute('title'), 'Theme: Dark');
  assert.equal(theme.button.getAttribute('aria-pressed'), 'true');
  await fullscreen.button.click();
  assert.equal(fullscreen.button.children[0], fullscreen.svg);
  assert.equal(fullscreen.svg.children[0], fullscreen.path);
  assert.equal(fullscreen.button.getAttribute('aria-label'), 'Exit fullscreen');
  assert.equal(fullscreenMobile.textContent, 'Exit Fullscreen');
  await fullscreen.button.click();
  assert.equal(fullscreenMobile.textContent, 'Fullscreen');
  assert.equal(fullscreen.button.getAttribute('aria-pressed'), 'false');
  main.requestFullscreen = async () => { throw new Error('denied'); };
  await fullscreen.button.click();
  assert.equal(fullscreen.button.children[0], fullscreen.svg);
  assert.equal(fullscreen.button.getAttribute('aria-label'), 'Enter fullscreen');
  assert.equal(fullscreenMobile.textContent, 'Fullscreen');
  themeController.destroy(); fullscreenController.destroy();
  assert.equal((theme.button.listeners.get('click') || []).length, 0);
  assert.equal((fullscreen.button.listeners.get('click') || []).length, 0);
});
test('harness has one Undo/Redo registration boundary and one replay per click', async () => {
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.doesNotMatch(source, /undoHistoryButton\.addEventListener|redoHistoryButton\.addEventListener/);
  assert.match(source, /if \(!historyToolbar\) historyToolbar = createHistoryToolbarController/);
  const undo = new FakeElement(); const redo = new FakeElement();
  let history = { undo: [{ action: 'Add Data' }, { action: 'Edit Data' }], redo: [] };
  let revisions = 0; let transfers = 0; let blocked = false; const runs = [];
  const controller = createHistoryToolbarController({ undoButton: undo, redoButton: redo, getHistory: () => history, getBlockedReason: () => blocked,
    run: (direction) => {
      runs.push(direction);
      if (blocked) return;
      const sourceStack = direction === 'undo' ? history.undo : history.redo;
      const targetStack = direction === 'undo' ? history.redo : history.undo;
      const entry = sourceStack.pop();
      targetStack.push(entry);
      revisions += 1; transfers += 1; controller.sync();
    } });
  controller.sync();
  assert.equal((undo.listeners.get('click') || []).length, 1);
  assert.equal((redo.listeners.get('click') || []).length, 1);
  await undo.click();
  assert.deepEqual(runs, ['undo']);
  assert.equal(revisions, 1);
  assert.equal(transfers, 1);
  assert.equal(history.undo.length, 1);
  assert.deepEqual(history.undo.at(-1), { action: 'Add Data' });
  await redo.click();
  assert.deepEqual(runs, ['undo', 'redo']);
  assert.equal(revisions, 2);
  assert.equal(transfers, 2);
  assert.equal(history.undo.length, 2);
  blocked = true;
  await undo.click();
  assert.equal(revisions, 2);
  controller.sync();
  controller.sync();
  assert.equal((undo.listeners.get('click') || []).length, 1);
  assert.equal((redo.listeners.get('click') || []).length, 1);
});test('direct theme redraw is blocked from installing a frame during transition ownership', () => {
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /function refreshCanvasTheme\(\) \{[\s\S]*?navigator\?\.busy[\s\S]*?return;/);
  assert.match(source, /if \(!historyToolbar\) historyToolbar = createHistoryToolbarController/);
});test('unsupported icon-only fullscreen preserves SVG and synchronizes mobile state', () => {
  const fullscreen = iconOnlyFixture('fullscreen');
  const mobile = new FakeElement({ presentation: 'text' });
  const document = { fullscreenEnabled: false, fullscreenElement: null, documentElement: new FakeElement(), addEventListener() {}, removeEventListener() {} };
  const controller = createFullscreenController({ document, element: {}, button: fullscreen.button, onState: ({ active }) => { mobile.textContent = active ? 'Exit Fullscreen' : 'Fullscreen'; } });
  assert.equal(fullscreen.button.children[0], fullscreen.svg);
  assert.equal(fullscreen.svg.children[0], fullscreen.path);
  assert.equal(fullscreen.button.getAttribute('aria-label'), 'Enter fullscreen');
  assert.equal(fullscreen.button.getAttribute('aria-disabled'), 'true');
  assert.equal(fullscreen.button.getAttribute('title'), 'Fullscreen is not supported by this browser.');
  assert.equal(mobile.textContent, 'Fullscreen');
  controller.destroy();
});test('creation ownership preserves recovery failure and releases exactly once', () => {
  const ownership = createInteractionOwnership({ recoveryFailed: true });
  assert.equal(ownership.blocked(), true);
  ownership.beginCreation();
  assert.equal(ownership.creationOwned, true);
  assert.equal(ownership.recoveryFailed, true);
  assert.equal(ownership.blocked(), true);
  assert.equal(ownership.releaseCreation(), true);
  assert.equal(ownership.releaseCreation(), false);
  assert.equal(ownership.creationOwned, false);
  assert.equal(ownership.recoveryFailed, true);
  assert.equal(ownership.blocked(), true);
  ownership.markRecoveryFailure();
  ownership.clearRecoveryFailure();
  assert.equal(ownership.recoveryFailed, false);
  assert.equal(ownership.blocked(), false);
  ownership.beginCreation();
  ownership.clearRecoveryFailure();
  assert.equal(ownership.blocked(), true);
  ownership.releaseCreation();
  assert.equal(ownership.blocked(), false);
});
test('harness shared gates consume ownership for graph, history, Fit, editor and drag paths', () => {
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(ownership\.creationOwned\) return 'create-map-open';/);
  assert.match(source, /if \(ownership\.recoveryFailed\) return 'editor-inert';/);
  assert.match(source, /canEdit: \(\) => !ownership\.blocked\(\)/);
  assert.match(source, /if \(ownership\.blocked\(\)\) return \{ ok: false, reason: 'interaction-inert' \};/);
  assert.match(source, /if \(creationTerminalHandled\) return;/);
  assert.match(source, /const restored = restoreSuspendedMap\(\);/);
});

test('responsive fallback resolver ignores null offsetParent and hidden menu items', () => {
  const document = { defaultView: null };
  const desktop = new FakeElement(); desktop.offsetParent = null; desktop.focus = function () { this.focused = true; };
  const mapMenu = new FakeElement(); mapMenu.hidden = true;
  const mobile = new FakeElement(); mobile.offsetParent = null; mobile.parent = mapMenu; mobile.focus = function () { this.focused = true; };
  const trigger = new FakeElement(); trigger.offsetParent = null; trigger.focus = function () { this.focused = true; };
  assert.equal(resolveFocusFallback({ document, candidates: [desktop], fallback: trigger }), desktop);
  assert.equal(resolveFocusFallback({ document, candidates: [mobile], fallback: trigger }), trigger);
  desktop.hidden = true;
  assert.equal(resolveFocusFallback({ document, candidates: [desktop, mobile], fallback: trigger }), trigger);
  desktop.hidden = false; desktop.isConnected = false;
  assert.equal(resolveFocusFallback({ document, candidates: [desktop], fallback: trigger }), trigger);
  desktop.isConnected = true; desktop.disabled = true;
  assert.equal(resolveFocusFallback({ document, candidates: [desktop], fallback: trigger }), trigger);
});
test('open popup re-clamps on resize, preserves focus/scroll, and safely handles hidden trigger', () => {
  const viewport = { width: 640, height: 600 };
  const viewListeners = new Map();
  const view = { get innerWidth() { return viewport.width; }, get innerHeight() { return viewport.height; }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }), addEventListener(type, fn) { viewListeners.set(type, fn); }, removeEventListener(type, fn) { if (viewListeners.get(type) === fn) viewListeners.delete(type); }, visualViewport: null };
  const document = { defaultView: view, documentElement: { get clientWidth() { return viewport.width; }, get clientHeight() { return viewport.height; } }, activeElement: null, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); } };
  const button = new FakeElement(); button.ownerDocument = document; button.rect = { left: 472, bottom: 40, width: 20, height: 20 }; button.getBoundingClientRect = () => ({ ...button.rect });
  const menu = new FakeElement(); menu.ownerDocument = document; menu.style = {}; menu.scrollTop = 0; menu.getBoundingClientRect = () => ({ width: 160, height: Math.min(500, Number.parseFloat(menu.style.maxHeight) || 500) });
  const item = new FakeElement(); item.tagName = 'BUTTON'; item.ownerDocument = document; menu.children = [item]; menu.querySelector = () => item;
  const popup = createPopupMenu({ document, button, menu });
  popup.show();
  assert.equal(menu.style.maxHeight, '584px'); assert.equal(menu.style.maxWidth, '624px');
  assert.equal(menu.style.overflowY, 'auto'); assert.equal(menu.style.left, '472px'); assert.equal(menu.style.top, '44px');
  assert.equal(menu.hidden, false); assert.equal(item.focused, true);
  menu.scrollTop = 40;
  viewport.width = 320; viewport.height = 240;
  viewListeners.get('resize')();
  assert.equal(menu.style.maxHeight, '224px'); assert.equal(menu.style.maxWidth, '304px');
  assert.equal(menu.style.left, '152px'); assert.equal(menu.style.top, '8px');
  assert.equal(item.focused, true); assert.equal(menu.scrollTop, 40); assert.equal(menu.hidden, false);
  button.rect.left = 20; viewport.width = 800; viewport.height = 700; viewListeners.get('resize')();
  assert.equal(menu.style.left, '20px'); assert.equal(menu.style.maxHeight, '684px');
  viewport.width = 320; viewport.height = 240; document.listeners.get('fullscreenchange')();
  assert.equal(menu.style.maxHeight, '224px'); assert.equal(menu.hidden, false);
  viewport.height = 60; button.rect.left = 300; viewListeners.get('resize')();
  assert.equal(menu.style.maxHeight, '44px'); assert.ok(Number.parseFloat(menu.style.top) <= 16); assert.equal(menu.hidden, false);
  button.hidden = true; viewport.width = 320; viewport.height = 240; viewListeners.get('resize')();
  assert.equal(menu.hidden, true); assert.equal(button.focused, undefined);
  button.hidden = false; popup.show();
  assert.equal(menu.hidden, false);
  const closedLeft = menu.style.left; viewport.width = 500; viewListeners.get('resize')(); assert.notEqual(menu.style.left, closedLeft);
  popup.close({ restoreFocus: false }); assert.equal(viewListeners.size, 0); assert.equal(document.listeners.has('fullscreenchange'), false);
  popup.show(); popup.close({ restoreFocus: false }); menu.style.left = '111px';
  viewport.width = 300; assert.equal(menu.style.left, '111px');
  popup.show(); popup.destroy(); assert.equal(viewListeners.size, 0); assert.equal(document.listeners.size, 0);
});



