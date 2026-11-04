import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9251; const BASE = 'http://127.0.0.1:8142/analysis/stage2b2/index.html';
const evidenceDir = new URL('./evidence/', import.meta.url); mkdirSync(evidenceDir, { recursive: true });
const profile = new URL(`./.browser-profile-${process.pid}/`, import.meta.url);
const browser = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${decodeURIComponent(profile.pathname).replace(/^\//, '')}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000', '--disable-extensions', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20000, label = 'condition') { const end = Date.now() + timeout; while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch {} await sleep(100); } throw new Error(`timeout waiting for ${label}`); }
const target = await waitFor(async () => { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (!v.webSocketDebuggerUrl) return null; return (await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json()); }, 20000, 'target');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let sequence = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result); } });
function send(method, params = {}) { const id = ++sequence; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
const start = Date.now(); await waitFor(async () => { const r = await send('Runtime.evaluate', { expression: 'typeof window.stage2b2 === "object" && document.readyState === "complete"', returnByValue: true }); return r.result.value; }, 20000, 'app ready'); const loadMs = Date.now() - start;
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate failed'); return r.result.value; }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(new URL(name, evidenceDir), Buffer.from(r.data, 'base64')); }
async function mouseClick(x, y) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(100); }
async function clickSelector(selector) {
  const center = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!center) throw new Error(`missing selector ${selector}`);
  await mouseClick(center.x, center.y);
}
async function typeQuery(text) {
  await clickSelector('#query');
  await evaluate("document.getElementById('query').value = ''; true");
  await send('Input.insertText', { text });
}
const environment = await evaluate('({ userAgent: navigator.userAgent, language: navigator.language, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } })'); const product = (await send('Browser.getVersion')).product;
const reachability = [];
for (const shape of ['flat','wide','balanced','mixed','deep']) for (const total of [300,1000]) { await evaluate(`window.stage2b2.loadFixture(${JSON.stringify(shape)}, ${total}); true`); const sourceBefore = await evaluate('window.stage2b2.sourceSnapshot()'); const result = await evaluate('window.stage2b2.revealAll()'); const sourceAfter = await evaluate('window.stage2b2.sourceSnapshot()'); reachability.push({ shape, total, ...result, sourceUnchanged: sourceBefore === sourceAfter }); }
const overviews = {};
for (const shape of ['flat','wide','balanced','mixed','deep']) { await evaluate(`window.stage2b2.loadFixture(${JSON.stringify(shape)}, 1000); window.scrollTo(0,0); true`); overviews[shape] = await evaluate('window.stage2b2.stats()'); await screenshot(`overview-${shape}-1000.png`); }
// Actual proxy and file-label pointer interactions.
await evaluate("window.stage2b2.loadFixture('flat', 1000); window.scrollTo(0,0); true");
const proxyId = (await evaluate('window.stage2b2.visibleIds()')).find((id) => id.startsWith('proxy:'));
await evaluate(`window.stage2b2.select(${JSON.stringify(proxyId)})`); await screenshot('proxy-details.png');
const proxyCenter = await evaluate(`window.stage2b2.centerOf(${JSON.stringify(proxyId)})`);
await mouseClick(proxyCenter.x, proxyCenter.y); const afterProxy = await evaluate('window.stage2b2.state()'); await screenshot('focus-flat-cluster.png');
const visibleAfterProxy = await evaluate('window.stage2b2.visibleIds()');
const fileId = visibleAfterProxy.find((id) => !id.startsWith('proxy:') && id !== 'root');
const fileLabelCenter = await evaluate(`window.stage2b2.labelCenter(${JSON.stringify(fileId)})`);
await mouseClick(fileLabelCenter.x, fileLabelCenter.y); const afterFileLabel = await evaluate('window.stage2b2.state()'); await screenshot('selected-flat.png');
// Breadcrumb root and ancestor from expanded clusters.
await evaluate("(()=>{ window.stage2b2.loadFixture('flat',1000); const p=window.stage2b2.visibleIds().find(id=>id.startsWith('proxy:')); window.stage2b2.expandCluster(p); document.querySelectorAll('#crumbs .crumb')[0].click(); return true; })()"); const rootBreadcrumb = await evaluate('window.stage2b2.state()'); await screenshot('breadcrumb-root.png');
await evaluate("(()=>{ window.stage2b2.loadFixture('wide',1000); window.stage2b2.enterFolder('g0'); const p=window.stage2b2.visibleIds().find(id=>id.startsWith('proxy:')); window.stage2b2.expandCluster(p); document.querySelectorAll('#crumbs .crumb')[0].click(); return true; })()"); const ancestorBreadcrumb = await evaluate('window.stage2b2.state()'); await screenshot('breadcrumb-ancestor.png');
// Deep local scene.
await evaluate("window.stage2b2.loadFixture('deep',1000); window.scrollTo(0,0); true"); const deepId = await evaluate('window.stage2b2.deepestId()'); const deepStart = Date.now(); await evaluate(`window.stage2b2.reveal(${JSON.stringify(deepId)})`); const deepMs = Date.now() - deepStart; const deepState = await evaluate('window.stage2b2.stats()'); await screenshot('deep-focus.png');
// Search paging, target label/canvas ring, clear, and later-page reveal.
await evaluate("window.stage2b2.loadFixture('flat',1000); window.scrollTo(0,0); true");
const searchStart = Date.now(); const page1 = await evaluate("window.stage2b2.search('파일',1)"); const page1Ms = Date.now() - searchStart; await evaluate('window.scrollTo(0, document.body.scrollHeight); true'); await screenshot('search-page-1.png');
const page20Start = Date.now(); const page20 = await evaluate("window.stage2b2.search('파일',20)"); const page20Ms = Date.now() - page20Start; await screenshot('search-page-20.png');
const targetId = page20.results[page20.results.length - 1].id; const revealStart = Date.now(); const searchReveal = await evaluate(`window.stage2b2.revealSearchResult(${JSON.stringify(targetId)})`); const revealMs = Date.now() - revealStart; const labelStats = await evaluate('window.stage2b2.labelStats()'); const searchCanvasHit = await evaluate(`window.stage2b2.hitTest(window.stage2b2.centerOf(${JSON.stringify(targetId)}).layoutX, window.stage2b2.centerOf(${JSON.stringify(targetId)}).layoutY)`); const targetLabelCenter = await evaluate(`window.stage2b2.labelCenter(${JSON.stringify(targetId)})`); await mouseClick(targetLabelCenter.x, targetLabelCenter.y); const afterTargetLabel = await evaluate('window.stage2b2.state()'); const redBeforeClear = await evaluate("[...document.querySelectorAll('[data-vd-label-id]')].filter(g => getComputedStyle(g).color === 'rgb(231, 76, 60)').length"); await evaluate('window.scrollTo(0,0); true'); await screenshot('search-target.png');
await evaluate("(()=>{ const input=document.getElementById('query'); input.value=''; document.getElementById('search-button').click(); return true; })()"); const cleared = await evaluate('window.stage2b2.state()'); const clearedLabels = await evaluate("({ red: [...document.querySelectorAll('[data-vd-label-id]')].filter(g => getComputedStyle(g).color === 'rgb(231, 76, 60)').length, stats: window.stage2b2.labelStats() })"); const redAfterClear = await evaluate("[...document.querySelectorAll('[data-vd-label-id]')].filter(g => getComputedStyle(g).color === 'rgb(231, 76, 60)').length"); await screenshot('search-cleared.png');
// Actual user-facing search UI: typing, Search, Next/Previous, result click, clear, no-match, query reset.
await evaluate("window.stage2b2.loadFixture('flat',1000); window.scrollTo(0,0); true");
await typeQuery('파일'); await clickSelector('#search-button');
const uiPage1 = await evaluate("({ state: window.stage2b2.state(), summary: document.getElementById('search-summary').textContent, prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled, resultCount: document.querySelectorAll('#search-results .result').length })");
await screenshot('search-ui-page1.png');
const uiNextPages = [];
for (let index = 0; index < 19; index += 1) {
  await clickSelector('#next-page');
  uiNextPages.push(await evaluate('window.stage2b2.state()'));
}
const uiPage20 = await evaluate("({ state: window.stage2b2.state(), summary: document.getElementById('search-summary').textContent, prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled, resultCount: document.querySelectorAll('#search-results .result').length })");
await screenshot('search-ui-page20.png');
await clickSelector('#prev-page');
const uiPage19 = await evaluate("({ state: window.stage2b2.state(), prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled, resultCount: document.querySelectorAll('#search-results .result').length })");
await screenshot('search-ui-page19.png');
await evaluate("document.querySelector('#search-results .result:last-of-type').scrollIntoView({ block: 'center' }); true");
await clickSelector('#search-results .result:last-of-type');
const uiTarget = await evaluate("({ state: window.stage2b2.state(), details: document.getElementById('details').textContent, redLabels: [...document.querySelectorAll('[data-vd-label-id]')].filter(g => getComputedStyle(g).color === 'rgb(231, 76, 60)').length, labels: window.stage2b2.labelStats() })");
await evaluate('window.scrollTo(0,0); true'); await screenshot('search-ui-target.png');
await evaluate('window.scrollTo(0,0); true');
await typeQuery(''); await clickSelector('#search-button');
const uiCleared = await evaluate("({ state: window.stage2b2.state(), summary: document.getElementById('search-summary').textContent, prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled, redLabels: [...document.querySelectorAll('[data-vd-label-id]')].filter(g => getComputedStyle(g).color === 'rgb(231, 76, 60)').length })");
await screenshot('search-ui-cleared.png');
await typeQuery('없는검색어-XYZ'); await clickSelector('#search-button');
const uiNoMatch = await evaluate("({ state: window.stage2b2.state(), summary: document.getElementById('search-summary').textContent, prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled, text: document.getElementById('search-results').textContent })");
await screenshot('search-ui-no-match.png');
await typeQuery('파일'); await clickSelector('#search-button'); await clickSelector('#next-page');
const uiBeforeQueryChange = await evaluate('window.stage2b2.state()');
await typeQuery('노드'); await clickSelector('#search-button');
const uiChangedQuery = await evaluate("({ state: window.stage2b2.state(), summary: document.getElementById('search-summary').textContent, prevDisabled: document.getElementById('prev-page').disabled, nextDisabled: document.getElementById('next-page').disabled })");
await screenshot('search-ui-changed-query.png');

// Center hit, background, rapid navigation and repeated Back.
const centerHit = await evaluate(`(() => { const c=window.stage2b2.centerOf('root'); return c ? { hit: window.stage2b2.hitTest(c.layoutX,c.layoutY) } : null; })()`); const backgroundHit = await evaluate('window.stage2b2.hitTest(5,5)');
const rapidStart = Date.now(); const rapid = await evaluate("(() => { const api=window.stage2b2; let errors=0; api.loadFixture('wide',1000); for(let i=0;i<40;i++){ try { api.enterFolder('g0'); api.back(); api.overview(); } catch(e){ errors++; } } let backErrors=0; for(let i=0;i<10;i++){ try { api.back(); } catch(e){ backErrors++; } } return { errors, backErrors, state: api.cleanupState() }; })()"); const rapidMs = Date.now() - rapidStart;
await evaluate("window.stage2b2.loadFixture('mixed',1000); window.scrollTo(0,0); true");
const centerClickPoint = await evaluate("window.stage2b2.centerOf('root')"); await mouseClick(centerClickPoint.x, centerClickPoint.y); const centerClick = await evaluate('window.stage2b2.state()'); await screenshot('center-current.png');
const remount = await evaluate('window.stage2b2.remount(8)'); const cleanupState = await evaluate('window.stage2b2.cleanupState()');
const measurements = { environment: { ...environment, browserProduct: product, viewport: { width: 1600, height: 1000 } }, loadMs, reachability, overviews, proxyId, afterProxy, fileId, afterFileLabel, breadcrumbNavigation: { rootBreadcrumb, ancestorBreadcrumb }, deep: { id: deepId, ms: deepMs, state: deepState }, uiPaging: { page1: uiPage1, nextPages: uiNextPages, page20: uiPage20, page19: uiPage19, target: uiTarget, cleared: uiCleared, noMatch: uiNoMatch, beforeQueryChange: uiBeforeQueryChange, changedQuery: uiChangedQuery }, search: { page1: { total: page1.total, pages: page1.pages, results: page1.results.length, ms: page1Ms }, page20: { page: page20.page, results: page20.results.length, ms: page20Ms }, targetId, reveal: searchReveal, revealMs, labelStats, canvasHit: searchCanvasHit, targetLabelCenter, afterTargetLabel, redBeforeClear, redAfterClear, cleared, clearedLabels }, centerHit, centerClick, backgroundHit, rapid, rapidMs, remount, cleanupState, screenshots: ['overview-flat-1000.png','overview-wide-1000.png','overview-balanced-1000.png','overview-mixed-1000.png','overview-deep-1000.png','proxy-details.png','focus-flat-cluster.png','selected-flat.png','center-current.png','breadcrumb-root.png','breadcrumb-ancestor.png','deep-focus.png','search-ui-page1.png','search-ui-page20.png','search-ui-page19.png','search-ui-target.png','search-ui-cleared.png','search-ui-no-match.png','search-ui-changed-query.png'] };
writeFileSync(new URL('browser-measurements.json', evidenceDir), JSON.stringify(measurements, null, 2)); console.log(JSON.stringify(measurements, null, 2)); ws.close(); try { process.kill(browser.pid, 'SIGTERM'); } catch {}






