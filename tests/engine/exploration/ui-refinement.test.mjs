import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHistoryToolbarController, createFullscreenController, createTooltipController } from '../../harness/m5-exploration/shell-controls.js';

const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const aside = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
const actionBar = html.slice(html.indexOf('id="graph-action-toolbar"'), html.indexOf('id="graph-viewport"'));
const header = html.slice(html.indexOf('id="app-header"'), html.indexOf('</header>') + '</header>'.length);

test('developer Status block is absent while production diagnostics remain published', () => {
  assert.doesNotMatch(aside, /<h2>Status<\/h2>|Copy status|__M5_EXPLORATION_STATUS__|Click a folder to center|Right-click a folder|Data items choose/);
  assert.match(aside, /<h2>Details<\/h2>/);
  assert.match(aside, /id="details"/);
  assert.match(aside, /id="editor-host"/);
  assert.match(source, /window\.__M5_EXPLORATION_STATUS__ = status/);
  assert.match(source, /function publish\(/);
});

test('one centered icon toolbar owns Undo, Redo, Embed, Fullscreen, and Download', () => {
  assert.match(actionBar, /id="search-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="search-panel"/);
  assert.match(actionBar, /id="search-panel"[^>]*hidden/);
  assert.match(actionBar, /id="search-reserved"[^>]*aria-label="Search map"[^>]*maxlength="200"/);
  assert.match(actionBar, /id="search-close"[^>]*aria-label="Close search"/);
  assert.ok(actionBar.indexOf('id="search-toggle"') < actionBar.indexOf('id="search-reserved"'));
  assert.ok(actionBar.indexOf('id="search-panel"' ) < actionBar.indexOf('id="undo-history"'));
  assert.ok(html.indexOf('id="graph-wrap"') < html.indexOf('id="graph-action-toolbar"'));
  assert.ok(html.indexOf('id="graph-action-toolbar"' ) < html.indexOf('id="graph-viewport"'));
  assert.ok(html.indexOf('id="graph-viewport"' ) < html.indexOf('id="graph-host"'));
  assert.match(actionBar, /id="undo-history"[\s\S]*?id="redo-history"[\s\S]*?id="embed-action"[\s\S]*?id="fullscreen-action"[\s\S]*?id="download-backup"/);
  for (const id of ['search-toggle', 'undo-history', 'redo-history', 'embed-action', 'fullscreen-action', 'download-backup']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  for (const label of ['Search', 'Undo', 'Redo', 'Embed', 'Enter fullscreen', 'Download map copy']) assert.match(actionBar, new RegExp(`aria-label="${label}"`));
  for (const label of ['Search', 'Undo', 'Redo', 'Embed', 'Enter fullscreen', 'Download']) assert.match(actionBar, new RegExp(`title="${label}"`));
  assert.match(actionBar, /id="embed-action"[^>]*data-available="true"/); assert.doesNotMatch(actionBar, /id="embed-action"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(header, /id="fullscreen-action"|data-action="embed"|id="search-toggle"/);
  assert.doesNotMatch(header, /id="theme-action"/); assert.match(html, /<nav id="nav-rail"[\s\S]*?id="theme-action"/);
  assert.match(html, /#graph-action-toolbar \{[^}]*align-self: center;[^}]*margin: 4px auto 0/);
  assert.match(html, /\.graph-action-button \{[^}]*width: 32px;[^}]*height: 32px;[^}]*min-width: 32px;[^}]*min-height: 32px/);
  assert.match(html, /\.graph-action-button svg \{[^}]*width: 18px;[^}]*height: 18px/);
  assert.match(html, /@media \(pointer: coarse\)[\s\S]*?\.graph-action-button \{ width: 44px; height: 44px/);
  assert.match(html, /#graph-viewport \{ position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; \}/);
  assert.match(html, /#graph-host, #label-host \{ position: absolute; inset: 0; \}/);
  assert.match(html, /#app-root \{[^}]*grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(html, /#shell-status:empty \{ display: none; \}/);
  assert.match(html, /#error:empty \{ display: none; \}/);
});

test('history icons preserve their SVG while labels and tooltips update and guards disable actions', async () => {
  const makeButton = () => ({ dataset: { presentation: 'icon' }, disabled: false, attributes: new Map(), children: [], listeners: new Map(), setAttribute(n, v) { this.attributes.set(n, String(v)); }, getAttribute(n) { return this.attributes.get(n) ?? null; }, addEventListener(t, fn) { this.listeners.set(t, fn); }, removeEventListener() {}, querySelector() { return this.children[0] || null; } });
  const undo = makeButton(); const redo = makeButton(); const svg = { tagName: 'svg' }; undo.children.push(svg); redo.children.push({ tagName: 'svg' });
  let history = { undo: [{ action: 'Delete Data' }], redo: [] }; let blocked = true; const calls = [];
  const controller = createHistoryToolbarController({ undoButton: undo, redoButton: redo, getHistory: () => history, getBlockedReason: () => blocked, run: (direction) => calls.push(direction) });
  controller.sync();
  assert.equal(undo.children[0], svg);
  assert.equal(undo.textContent, undefined);
  assert.equal(undo.disabled, true);
  assert.equal(undo.getAttribute('aria-label'), 'Undo: Delete Data');
  assert.equal(undo.dataset.tooltip, 'Undo: Delete Data');
  blocked = false; controller.sync();
  assert.equal(undo.disabled, false); assert.equal(redo.disabled, true);
  await undo.listeners.get('click')();
  assert.deepEqual(calls, ['undo']);
  history = { undo: [], redo: [{ action: 'Add Data' }] }; controller.sync();
  assert.equal(undo.disabled, true); assert.equal(redo.disabled, false);
  assert.equal(redo.getAttribute('aria-label'), 'Redo: Add Data');
  controller.destroy();
});

test('fullscreen enter/exit updates accessible name, tooltip, native title, and pressed state', async () => {
  const button = { dataset: { presentation: 'icon' }, attributes: new Map(), listeners: new Map(), setAttribute(n, v) { this.attributes.set(n, String(v)); }, getAttribute(n) { return this.attributes.get(n) ?? null; }, removeAttribute(n) { this.attributes.delete(n); }, addEventListener(t, fn) { this.listeners.set(t, fn); }, removeEventListener() {}, querySelector() { return { tagName: 'svg' }; } };
  const document = { fullscreenEnabled: true, fullscreenElement: null, documentElement: { toggleAttribute() {} }, listeners: new Map(), addEventListener(t, fn) { this.listeners.set(t, fn); }, removeEventListener() {}, async exitFullscreen() { this.fullscreenElement = null; this.listeners.get('fullscreenchange')?.(); } };
  const element = { async requestFullscreen() { document.fullscreenElement = element; document.listeners.get('fullscreenchange')?.(); } };
  const controller = createFullscreenController({ document, element, button });
  assert.equal(button.getAttribute('aria-label'), 'Enter fullscreen');
  assert.equal(button.dataset.tooltip, 'Enter fullscreen');
  assert.equal(button.getAttribute('title'), 'Enter fullscreen');
  await button.listeners.get('click')();
  assert.equal(button.getAttribute('aria-label'), 'Exit fullscreen');
  assert.equal(button.dataset.tooltip, 'Exit fullscreen');
  assert.equal(button.getAttribute('title'), 'Exit fullscreen');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  await button.listeners.get('click')();
  assert.equal(button.getAttribute('aria-label'), 'Enter fullscreen');
  controller.destroy();
  assert.match(source, /fullscreenGlyph\?\.setAttribute\('d'/);
});

test('tooltip controller shows on focus and clamps inside the viewport', () => {
  const listeners = new Map();
  const makeButton = (left) => ({ dataset: { tooltip: 'Undo: Delete Data' }, listeners: new Map(), getBoundingClientRect: () => ({ left, right: left + 44, top: 20, bottom: 64, width: 44, height: 44 }), addEventListener(t, fn) { this.listeners.set(t, fn); }, removeEventListener() {} });
  const left = makeButton(2); const right = makeButton(300);
  const tooltip = { hidden: true, textContent: '', style: {}, getBoundingClientRect: () => ({ width: 160, height: 28 }), addEventListener() {}, removeEventListener() {} };
  const document = { documentElement: { clientWidth: 360, clientHeight: 400 }, defaultView: { innerWidth: 360, innerHeight: 400, addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {}, listeners };
  const controller = createTooltipController({ document, tooltip, buttons: [left, right], view: document.defaultView });
  left.listeners.get('focus')({ currentTarget: left });
  assert.equal(tooltip.hidden, false); assert.equal(tooltip.textContent, 'Undo: Delete Data');
  assert.ok(Number.parseFloat(tooltip.style.left) >= 8);
  right.listeners.get('focus')({ currentTarget: right });
  assert.ok(Number.parseFloat(tooltip.style.left) <= 192);
  left.listeners.get('blur')();
  assert.equal(tooltip.hidden, true);
  controller.destroy();
});

test('tooltip controller can be disabled and dismisses an active tooltip', () => {
  const button = { dataset: { tooltip: 'Create Map' }, listeners: new Map(), getBoundingClientRect: () => ({ left: 10, right: 54, top: 10, bottom: 54, width: 44, height: 44 }), addEventListener(t, fn) { this.listeners.set(t, fn); }, removeEventListener() {} };
  const tooltip = { hidden: true, textContent: '', style: {}, getBoundingClientRect: () => ({ width: 100, height: 24 }), addEventListener() {}, removeEventListener() {} };
  const document = { documentElement: { clientWidth: 360, clientHeight: 400 }, defaultView: { innerWidth: 360, innerHeight: 400, addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {} };
  let enabled = true;
  const controller = createTooltipController({ document, tooltip, buttons: [button], view: document.defaultView, enabled: () => enabled });
  button.listeners.get('focus')({ currentTarget: button });
  assert.equal(tooltip.hidden, false);
  enabled = false;
  controller.setEnabled(false);
  assert.equal(tooltip.hidden, true);
  controller.show(button);
  assert.equal(tooltip.hidden, true);
  enabled = true;
  controller.show(button);
  assert.equal(tooltip.hidden, false);
  controller.destroy();
});

test('touch tooltips auto-dismiss, invalidate older timers, and hide on outside/orientation', async () => {
  const listeners = new Map();
  const view = { innerWidth: 360, innerHeight: 400, navigator: { maxTouchPoints: 5 }, listeners, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }, removeEventListener() {} };
  const documentListeners = new Map();
  const document = { documentElement: { clientWidth: 360, clientHeight: 400 }, defaultView: view, listeners: documentListeners, addEventListener(type, fn) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(fn); }, removeEventListener() {} };
  const button = { dataset: { tooltip: 'More graph actions' }, listeners: new Map(), getBoundingClientRect: () => ({ left: 10, right: 54, top: 10, bottom: 54, width: 44, height: 44 }), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener() {} };
  const tooltip = { hidden: true, textContent: '', style: {}, getBoundingClientRect: () => ({ width: 100, height: 24 }) };
  const controller = createTooltipController({ document, tooltip, buttons: [button], view, touchDelay: 60 });
  button.listeners.get('focus')({ currentTarget: button });
  assert.equal(tooltip.hidden, false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  button.listeners.get('focus')({ currentTarget: button });
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(tooltip.hidden, false, 'older timer cannot hide the refreshed tooltip');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(tooltip.hidden, true, 'touch tooltip auto-dismisses');
  button.listeners.get('focus')({ currentTarget: button });
  assert.equal(tooltip.hidden, false);
  for (const fn of documentListeners.get('pointerdown') || []) fn({ target: {} });
  assert.equal(tooltip.hidden, true, 'outside pointer hides tooltip');
  button.listeners.get('focus')({ currentTarget: button });
  for (const fn of listeners.get('orientationchange') || []) fn({ type: 'orientationchange' });
  assert.equal(tooltip.hidden, true, 'orientation hides tooltip');
  assert.equal(controller.isTouch, true);
  controller.destroy();
});
