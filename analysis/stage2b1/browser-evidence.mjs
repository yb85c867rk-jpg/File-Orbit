import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9252;
const BASE = 'http://127.0.0.1:8142/analysis/stage2b1/index.html';
const evidenceDir = new URL('./evidence/', import.meta.url);
mkdirSync(evidenceDir, { recursive: true });
const profile = new URL('./.browser-profile/', import.meta.url);
if (existsSync(profile)) rmSync(profile, { recursive: true, force: true });
const browser = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${decodeURIComponent(profile.pathname).replace(/^\//, '')}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000', '--disable-extensions', 'about:blank'
], { stdio: 'ignore', windowsHide: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20000, label = 'condition') {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch {} await sleep(100); }
  throw new Error(`timeout waiting for ${label}`);
}
async function target() {
  return waitFor(async () => {
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    if (!version.webSocketDebuggerUrl) return null;
    const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
    return created;
  }, 20000, 'browser target');
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result); }
});
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
const start = Date.now();
await waitFor(async () => {
  const result = await send('Runtime.evaluate', { expression: 'typeof window.stage2b1 === "object" && document.readyState === "complete"', returnByValue: true });
  return result.result.value;
}, 20000, 'app ready');
const loadMs = Date.now() - start;
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed');
  return result.result.value;
}
async function screenshot(name, scroll = 0) {
  if (scroll) await evaluate(`window.scrollTo(0, ${scroll}); new Promise(r => setTimeout(r, 80))`);
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(new URL(name, evidenceDir), Buffer.from(result.data, 'base64'));
}
async function screenshotTop(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1600, height: 1000, scale: 1 } });
  writeFileSync(new URL(name, evidenceDir), Buffer.from(result.data, 'base64'));
}
async function mouseClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(80);
}
const environment = await evaluate(`({ userAgent: navigator.userAgent, language: navigator.language, devicePixelRatio: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } })`);
const version = (await send('Browser.getVersion')).product;

const reachability = [];
for (const shape of ['flat', 'wide', 'balanced', 'mixed', 'deep']) {
  for (const total of [300, 1000]) {
    const fixture = await evaluate(`window.stage2b1.loadFixture(${JSON.stringify(shape)}, ${total}).shape`);
    const sourceBefore = await evaluate('window.stage2b1.sourceSnapshot()');
    const result = await evaluate('window.stage2b1.revealAll()');
    const sourceAfter = await evaluate('window.stage2b1.sourceSnapshot()');
    reachability.push({ shape, total, fixture, ...result, sourceUnchanged: sourceBefore === sourceAfter });
  }
}

// Every fixture shape: rendered overview screenshot and scene statistics.
const overviews = {};
for (const shape of ['flat', 'wide', 'balanced', 'mixed', 'deep']) {
  await evaluate(`window.stage2b1.loadFixture(${JSON.stringify(shape)}, 1000); window.scrollTo(0, 0); true`);
  overviews[shape] = await evaluate('window.stage2b1.stats()');
  await screenshot(`overview-${shape}-1000.png`);
}

// Breadcrumb navigation from expanded root-level and non-root clusters.
await evaluate("window.stage2b1.loadFixture('flat', 1000); window.scrollTo(0, 0); true");
const rootClusterProxy = (await evaluate('window.stage2b1.visibleIds()')).find((id) => id.startsWith('proxy:'));
await evaluate(`window.stage2b1.expandCluster(${JSON.stringify(rootClusterProxy)})`);
await evaluate("document.querySelectorAll('#crumbs .crumb')[0].click(); true");
const rootBreadcrumb = await evaluate('window.stage2b1.state()');
await screenshot('breadcrumb-root.png');
await evaluate("window.stage2b1.loadFixture('wide', 1000); window.stage2b1.enterFolder('g0'); true");
const ancestorProxy = (await evaluate('window.stage2b1.visibleIds()')).find((id) => id.startsWith('proxy:'));
await evaluate(`window.stage2b1.expandCluster(${JSON.stringify(ancestorProxy)})`);
await evaluate("document.querySelectorAll('#crumbs .crumb')[0].click(); true");
const ancestorBreadcrumb = await evaluate('window.stage2b1.state()');
await screenshot('breadcrumb-ancestor.png');

// Overview screenshot and actual proxy click.
await evaluate("window.stage2b1.loadFixture('mixed', 1000); window.scrollTo(0, 0); true");
await sleep(120);
const overview = await evaluate('window.stage2b1.stats()');
await screenshot('overview-mixed-1000.png');
await evaluate("window.stage2b1.loadFixture('flat', 1000); window.scrollTo(0, 0); true");
await screenshot('overview-flat-1000.png');
const proxyId = (await evaluate('window.stage2b1.visibleIds()')).find((id) => id.startsWith('proxy:'));
await evaluate(`window.stage2b1.select(${JSON.stringify(proxyId)})`);
await screenshot('proxy-details.png');
const proxyCenter = await evaluate(`window.stage2b1.centerOf(${JSON.stringify(proxyId)})`);
const clickStart = Date.now();
await mouseClick(proxyCenter.x, proxyCenter.y);
const afterProxyClick = await evaluate('window.stage2b1.state()');
const proxyClickMs = Date.now() - clickStart;
await screenshot('focus-flat-cluster.png');
const visibleDocumentIds = await evaluate('window.stage2b1.visibleIds()');
const documentId = visibleDocumentIds.find((id) => !id.startsWith('proxy:'));
const docCenter = await evaluate(`window.stage2b1.centerOf(${JSON.stringify(documentId)})`);
await mouseClick(docCenter.x, docCenter.y);
const selected = await evaluate('window.stage2b1.state()');
await screenshot('selected-flat.png');

// Deep local focus, no global layout.
await evaluate("window.stage2b1.loadFixture('deep', 1000); window.scrollTo(0, 0); true");
const deepId = await evaluate('window.stage2b1.deepestId()');
const deepStart = Date.now();
await evaluate(`window.stage2b1.reveal(${JSON.stringify(deepId)})`);
const deepRevealMs = Date.now() - deepStart;
const deepState = await evaluate('window.stage2b1.stats()');
await screenshot('deep-focus.png');

// Folder navigation and return.
await evaluate("window.stage2b1.loadFixture('wide', 300); window.scrollTo(0, 0); true");
const wideIds = await evaluate('window.stage2b1.documentIds()');
let folderId = null;
for (const id of wideIds.slice(0, 30)) {
  const info = await evaluate(`window.stage2b1.documentInfo(${JSON.stringify(id)})`);
  if (info?.kind === 'folder' && id !== 'root') { folderId = id; break; }
}
const folderStart = Date.now();
const folderState = await evaluate(`window.stage2b1.enterFolder(${JSON.stringify(folderId)})`);
const folderNavigationMs = Date.now() - folderStart;
await screenshot('folder-navigation.png');
const backState = await evaluate('window.stage2b1.back()');
const folderBackState = await evaluate('window.stage2b1.state()');

// Search paging and actual search-target reveal.
await evaluate("window.stage2b1.loadFixture('flat', 1000); window.scrollTo(0, 0); true");
const searchStart = Date.now();
const page1 = await evaluate("window.stage2b1.search('파일', 1)");
const searchPage1Ms = Date.now() - searchStart;
await evaluate('window.scrollTo(0, document.body.scrollHeight); true');
await screenshot('search-page-1.png');
const page20Start = Date.now();
const page20 = await evaluate("window.stage2b1.search('파일', 20)");
const searchPage20Ms = Date.now() - page20Start;
await screenshot('search-page-20.png');
const targetId = page20.results[page20.results.length - 1].id;
const revealSearchStart = Date.now();
const searchReveal = await evaluate(`window.stage2b1.revealSearchResult(${JSON.stringify(targetId)})`);
const searchRevealMs = Date.now() - revealSearchStart;
const labelStats = await evaluate('window.stage2b1.labelStats()');
await screenshotTop('search-target.png');

// Actual search input/control clear: remove search target, preserve ordinary selection.
await evaluate("const input = document.getElementById('query'); input.value = ''; document.getElementById('search-button').click(); true");
const searchCleared = await evaluate('window.stage2b1.state()');
const clearedDom = await evaluate("({ redTargets: document.querySelectorAll('.search-target').length, selected: document.querySelectorAll('.selected').length })");
await screenshotTop('search-cleared.png');

// Exact hit test and scene info.
const hit = await evaluate(`(() => { const center = window.stage2b1.centerOf(${JSON.stringify(targetId)}); return center ? { center, hit: window.stage2b1.hitTest(center.layoutX, center.layoutY) } : null; })()`);
const centerHit = await evaluate(`(() => { const center = window.stage2b1.centerOf('root'); return center ? { center, hit: window.stage2b1.hitTest(center.layoutX, center.layoutY) } : null; })()`);
const backgroundHit = await evaluate('window.stage2b1.hitTest(1, 1)');
const finalStats = await evaluate('window.stage2b1.stats()');
const measurements = {
  environment: { ...environment, browserProduct: version, viewport: { width: 1600, height: 1000 } },
  loadMs,
  reachability,
  overviews,
  overview,
  breadcrumbNavigation: { rootBreadcrumb, ancestorBreadcrumb },
  proxyId,
  proxyClickMs,
  afterProxyClick,
  visibleDocumentIds,
  selectedAfterDocumentClick: selected,
  deep: { id: deepId, revealMs: deepRevealMs, stats: deepState },
  folderNavigation: { folderId, folderState, backState, folderBackState, ms: folderNavigationMs },
  search: { page1: { total: page1.total, pages: page1.pages, results: page1.results.length, ms: searchPage1Ms }, page20: { page: page20.page, results: page20.results.length, ms: searchPage20Ms }, revealMs: searchRevealMs, targetId, final: searchReveal, hit, labelStats, cleared: searchCleared, clearedDom },
  centerHit,
  backgroundHit,
  finalStats,
  screenshots: ['overview-flat-1000.png', 'overview-wide-1000.png', 'overview-balanced-1000.png', 'overview-mixed-1000.png', 'overview-deep-1000.png', 'breadcrumb-root.png', 'breadcrumb-ancestor.png', 'proxy-details.png', 'focus-flat-cluster.png', 'selected-flat.png', 'deep-focus.png', 'folder-navigation.png', 'search-page-1.png', 'search-page-20.png', 'search-target.png', 'search-cleared.png']
};
writeFileSync(new URL('browser-measurements.json', evidenceDir), JSON.stringify(measurements, null, 2));
console.log(JSON.stringify(measurements, null, 2));
ws.close();
try { process.kill(browser.pid, 'SIGTERM'); } catch {}










