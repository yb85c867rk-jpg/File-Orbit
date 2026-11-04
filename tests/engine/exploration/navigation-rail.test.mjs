import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const body = html.slice(html.indexOf('<div id="app-root">'), html.indexOf('<pre id="status"'));
const header = body.slice(body.indexOf('<header id="app-header">'), body.indexOf('</header>'));
const rail = body.slice(body.indexOf('<nav id="nav-rail"'), body.indexOf('</nav>') + 6);
const toolbar = body.slice(body.indexOf('id="graph-action-toolbar"'), body.indexOf('id="graph-viewport"'));
const main = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../../harness/m5-exploration/document-adapter.js', import.meta.url), 'utf8');
const searchHighlightModule = readFileSync(new URL('../../../src/engine/hypertree/exploration/search-highlight.js', import.meta.url), 'utf8');
test('primary actions live once in the left rail; header/menu copies are gone', () => {
  assert.doesNotMatch(header, /data-action="(?:create-map|open-document|save-document-as|save-map|upload|download|open-map)"/);
  assert.doesNotMatch(header, /document-name|save-state|storage-help/);
  assert.doesNotMatch(body, /header-menu-cluster|map-menu-button|theme-mobile/);
  assert.doesNotMatch(header, /more-menu-button/);
  const order = ['data-action="create-map"', 'id="open-orbit-action"', 'data-action="save-document-as"', 'id="orbit-toggle"', 'id="settings-action"'];
  let last = -1;
  for (const token of order) { const at = rail.indexOf(token); assert.ok(at > last, token); last = at; }
  assert.doesNotMatch(rail.slice(0, rail.indexOf('id="settings-panel"')), /data-action="save-map"/);
  assert.match(rail, /id="theme-action"/);
  for (const id of ['nav-rail-toggle', 'settings-action', 'theme-action', 'orbit-toggle', 'orbit-panel', 'orbit-refresh', 'copy-map', 'download-backup', 'search-toggle', 'undo-history', 'redo-history', 'embed-action', 'fullscreen-action']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  assert.match(rail, /id="nav-rail-toggle"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls="nav-rail-items"/);
});
test('rail collapses to icons, expands labels, and overlays on phones with touch targets', () => {
  assert.match(css, /#nav-rail\[data-expanded="false"\] \.nav-label \{ display: none; \}/);
  assert.match(css, /#nav-rail\[data-expanded="true"\] \{ flex-basis: 204px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?#nav-rail \{ position: fixed; left: 8px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?#nav-rail\[data-expanded="true"\]/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /#nav-rail \{[^}]*overflow-y: auto/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
});
test('header is brand-only; feedback and save state live outside it', () => {
  assert.equal(header.replace(/<[^>]+>/g, '').trim(), '');
  assert.match(header, /id="brand-logo"[^>]*src="assets\/fileorbit-mark\.png"[^>]*width="28"[^>]*height="26"[^>]*alt="FileOrbit"/);
  assert.doesNotMatch(header, /document-name|save-state|storage-help|dev-controls|shell-status|fixture|id="fit"|counts/);
  assert.match(body, /id="document-feedback"[^>]*hidden[^>]*aria-hidden="true"[\s\S]*?id="document-name"[\s\S]*?id="save-state"/);
  assert.match(css, /\.document-feedback\[hidden\] \{ display: none; \}/);
  assert.match(css, /#shell-status\[data-feedback-kind="routine"\] \{[^}]*position: absolute[^}]*clip: rect\(0 0 0 0\)/);
  assert.match(main, /shellStatusEl\.dataset\.feedbackKind = nextKind/);
  assert.match(main, /ROUTINE_NOTIFICATION_MS = 4000/);
  assert.match(main, /TRANSIENT_NOTIFICATION_MS = 3000/);
  assert.match(css, /#open-orbit-action \.nav-label \{ font-size: 14px; \}/);
  assert.match(css, /#open-orbit-menu button \{[^}]*font-size: 13px/);
  assert.match(css, /#feedback-host \{[^}]*left: 50%[^}]*transform: translateX\(-50%\)/);
  assert.match(css, /#shell-status\[hidden\][^{]*\{[^}]*display: none !important[^}]*pointer-events: none/);
  assert.match(searchHighlightModule, /export const SEARCH_HIGHLIGHT_COLOR = '#60A5FA'/);
  assert.match(searchHighlightModule, /export const SEARCH_HIGHLIGHT_EDGE_OPACITY = 0\.55/);
  assert.match(main, /highlightSearchFolderScene/);
  assert.match(body, /id="shell-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(body, /id="feedback-host"[\s\S]*?id="shell-status"/);
  assert.match(body, /id="dev-controls"[^>]*hidden/);
  assert.doesNotMatch(rail, /id="settings-save"|data-action="open-map"|id="fit"|id="storage-help"/);
  assert.match(rail, /id="settings-panel"[\s\S]*?id="theme-action"[\s\S]*?<\/div>/);
  assert.match(css, /aside\[data-editor-active="true"\] #details/);
  assert.match(css, /aside\[data-editor-active="true"\] #search-results-host/);
  assert.match(css, /#shell-status \{[^}]*position: fixed|#feedback-host \{[^}]*position: fixed/);
});
test('download is the final toolbar action, Open accepts both containers, no duplicate install controls', () => {
  const order = ['search-toggle', 'undo-history', 'redo-history', 'embed-action', 'fullscreen-action', 'copy-map', 'download-backup'];
  let last = -1;
  for (const id of order) { const at = toolbar.indexOf(id); assert.ok(at > last, id); last = at; }
  assert.match(toolbar, /id="copy-map"[^>]*data-action="copy-map"[^>]*aria-label="Copy Map"[^>]*title="Copy Map"[^>]*data-tooltip="Copy Map"/);
  assert.match(toolbar, /id="download-backup"[^>]*data-action="download"[^>]*aria-label="Download map copy"/);
  assert.match(main, /safeDocumentFilename\(capturedName\)/);
  assert.match(adapter, /description: 'Orbit files \(\*\.orbit\)'/);
  assert.match(adapter, /'application\/x-orbit': Object\.freeze\(\['\.orbit'\]\)/);
  assert.match(main, /if \(action === 'upload'\)/); // internal compatibility only
  assert.doesNotMatch(header, /Upload|Import Backup/);
});

test('Settings contains only the theme control; document/save feedback is outside it', () => {
  const start = rail.indexOf('id="settings-panel"');
  const panel = rail.slice(start, rail.indexOf('</div>', start) + 6);
  assert.match(panel, /id="theme-action"/);
  assert.doesNotMatch(panel, /settings-save|Previous local maps|Fit graph|Storage &amp; backup help|document-name|save-state/);
  assert.match(body, /id="document-feedback"[^>]*hidden[\s\S]*?id="save-state"/);
  assert.doesNotMatch(rail, /id="orbit-action"|id="orbit-open"/);
});

test('connected Orbit menu sits between Save As and Settings with accessible toggle and retained actions', () => {
  const saveAs = rail.indexOf('data-action="save-document-as"');
  const orbit = rail.indexOf('id="orbit-section"');
  const toggle = rail.indexOf('id="orbit-toggle"');
  const settings = rail.indexOf('id="settings-action"');
  assert.ok(saveAs >= 0 && saveAs < orbit && orbit < toggle && toggle < settings, 'Orbit menu is between Save As and Settings');
  assert.match(rail, /id="orbit-section"[^>]*hidden/);
  assert.match(rail, /id="orbit-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="orbit-panel"/);
  assert.match(rail, /id="orbit-toggle"[\s\S]*?class="nav-icon nav-icon-mask orbit-folder-icon"/);
  assert.match(rail, /id="orbit-name"[^>]*class="nav-label orbit-name"/);
  assert.match(rail, /id="orbit-panel"[^>]*hidden/);
  assert.match(rail, /id="orbit-refresh"[^>]*>Refresh list/);
  assert.doesNotMatch(rail, /id="orbit-close"|id="orbit-add"/);
  assert.match(css, /\.orbit-toggle\[hidden\] \{ display: none; \}/);
  assert.match(css, /#nav-rail\[data-expanded="false"\] \.nav-label \{ display: none; \}/);
  assert.match(css, /\.orbit-entry-name \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /#nav-rail\[data-expanded="false"\] \.orbit-chevron \{ display: none; \}/);
  assert.match(css, /#app-root:fullscreen \{[^}]*overflow: hidden/);
  assert.match(css, /\.orbit-panel \{[^}]*max-height:[^}]*overflow-y: auto/);
  assert.match(css, /\.orbit-list \{[^}]*max-height:[^}]*overflow-y: auto/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.orbit-panel \{ max-height/);
});

test('approved variation 06 logo, favicon, title, and accessible brand are installed locally', () => {
  const assets = new URL('../../harness/m5-exploration/assets/', import.meta.url);
  for (const name of ['fileorbit-mark.png', 'fileorbit-favicon.ico', 'fileorbit-favicon-16.png', 'fileorbit-favicon-32.png']) assert.equal(existsSync(new URL(name, assets)), true, name);
  assert.match(html, /<title>FileOrbit<\/title>/);
  assert.doesNotMatch(html, /M5 Exploration|development-harness/i);
  assert.match(html, /rel="icon"[^>]*href="assets\/fileorbit-favicon\.ico"/);
  assert.match(html, /rel="icon"[^>]*sizes="32x32"[^>]*href="assets\/fileorbit-favicon-32\.png"/);
  assert.match(html, /rel="icon"[^>]*sizes="16x16"[^>]*href="assets\/fileorbit-favicon-16\.png"/);
  assert.match(header, /id="brand-logo"[^>]*alt="FileOrbit"/);
  assert.doesNotMatch(header, /<svg|Close FileOrbit|exit|data-action=/i);
  assert.match(css, /#brand \{[^}]*height: 26px/);
  assert.match(css, /#brand-logo \{[^}]*height: 26px/);
  assert.equal(createHash('sha256').update(readFileSync(new URL('fileorbit-mark.png', assets))).digest('hex').toUpperCase(), '4DF9850BE98A4D48F058E335C002F2247CED9AC9DA89249B585D75E755939C3B');
});


test('sidebar Create Map and connected Orbit use the supplied local theme-masked assets', () => {
  const assets = new URL('../../harness/m5-exploration/assets/', import.meta.url);
  const graph = new URL('graph_4_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png', assets);
  const orbit = new URL('hdr_weak_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png', assets);
  const open = new URL('folder_supervised_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png', assets);
  assert.equal(existsSync(graph), true);
  assert.equal(existsSync(orbit), true);
  assert.equal(existsSync(open), true);
  assert.equal(createHash('sha256').update(readFileSync(graph)).digest('hex').toUpperCase(), 'F15D48313BBC53934DF28A607B57035E674270780E9D85CFF579F8FD84588020');
  assert.equal(createHash('sha256').update(readFileSync(orbit)).digest('hex').toUpperCase(), 'DEF08AA09D13073BF689A23F89D7EEAAAE93923C3C57B91E8363A8DA15D327B6');
  assert.equal(createHash('sha256').update(readFileSync(open)).digest('hex').toUpperCase(), 'A4F60E231CBFCBD3C33F8898E1241A21B02E9DCFBB9873041BC1E7FA9321A97F');
  assert.match(html, /data-action="create-map"[\s\S]*?class="nav-icon nav-icon-mask create-map-icon"[\s\S]*?aria-hidden="true"/);
  assert.match(html, /id="orbit-toggle"[\s\S]*?class="nav-icon nav-icon-mask orbit-folder-icon"[\s\S]*?aria-hidden="true"/);
  assert.match(html, /assets\/graph_4_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24\.png/);
  assert.match(html, /id="open-orbit-action"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="open-orbit-menu"[^>]*aria-label="Open Orbit"[\s\S]*?class="nav-icon nav-icon-mask open-orbit-icon"[\s\S]*?aria-hidden="true"[\s\S]*?<span class="nav-label">Open Orbit<\/span>/);
  assert.match(html, /assets\/folder_supervised_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24\.png/);
  assert.match(html, /assets\/hdr_weak_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24\.png/);
  assert.doesNotMatch(html, /C:\\Users|file:\/\//);
  const createStart = rail.indexOf('data-action="create-map"');
  assert.doesNotMatch(rail.slice(createStart, rail.indexOf('</button>', createStart)), /<svg/);
  const openStart = rail.indexOf('id="open-orbit-action"');
  assert.doesNotMatch(rail.slice(openStart, rail.indexOf('</button>', openStart)), /<svg/);
  const orbitStart = rail.indexOf('id="orbit-toggle"');
  assert.doesNotMatch(rail.slice(orbitStart, rail.indexOf('</button>', orbitStart)), /<svg class="nav-icon orbit-folder-icon"/);
});

test('Orbit refresh precedes empty/list content and status follows the list in DOM order', () => {
  const panel = rail.slice(rail.indexOf('id="orbit-panel"'), rail.indexOf('</nav>'));
  const actions = panel.indexOf('class="orbit-actions"');
  const empty = panel.indexOf('id="orbit-empty"');
  const list = panel.indexOf('id="orbit-list"');
  const status = panel.indexOf('id="orbit-status"');
  assert.ok(actions >= 0 && actions < empty && empty < list && list < status);
  assert.match(panel.slice(status), /id="orbit-status"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/);
});


test('expanded sidebar exposes the independent circular Open Orbit help control', () => {
  assert.match(html, /id="open-orbit-help"[^>]*class="open-orbit-help"[^>]*aria-label="About Orbit files"[^>]*aria-controls="open-orbit-help-text"/);
  assert.doesNotMatch(html, /id="open-orbit-help"[^>]*data-action=/);
  assert.match(html, /id="open-orbit-help-text"[^>]*role="tooltip"[^>]*hidden>Open Orbit offers Orbit File for one \.orbit file, or Orbit Folder to browse subfolders and \.orbit files before connecting or opening\.<\/div>/);
  assert.match(html, /id="open-orbit-action"[^>]*aria-haspopup="menu"[^>]*aria-controls="open-orbit-menu"/);
  assert.match(html, /id="open-orbit-menu"[^>]*role="menu"[^>]*hidden[\s\S]*?data-open-kind="file"[^>]*>Orbit File[\s\S]*?data-open-kind="folder"[^>]*>Orbit Folder/);
  assert.match(html, /<div class="open-orbit-row">[\s\S]*?id="open-orbit-action"[\s\S]*?id="open-orbit-help"[\s\S]*?<\/div>/);
  assert.doesNotMatch(html, /id="open-orbit-help"[^>]*data-action=/);
  assert.match(css, /#nav-rail\[data-expanded="false"\] \.open-orbit-help \{ display: none; \}/);
  assert.match(css, /\.open-orbit-help \{[^}]*border-radius: 50%/);
});

