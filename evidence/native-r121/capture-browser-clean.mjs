import { writeFile } from 'node:fs/promises';
const out = 'evidence/native-r121';
const v = await (await fetch('http://127.0.0.1:9222/json/version')).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
let seq = 0; const pending = new Map();
ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const context = await send('Target.createBrowserContext', { disposeOnDetach: true });
const created = await send('Target.createTarget', { url: 'http://127.0.0.1:8099/tests/harness/m5-exploration/', browserContextId: context.browserContextId });
const session = (await send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId;
await new Promise((resolve) => setTimeout(resolve, 1800));
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)).result.value;
const desktop = await evalJs(`(() => ({
  title: document.title, url: location.href, userAgent: navigator.userAgent,
  secureContext: isSecureContext,
  directoryPicker: typeof showDirectoryPicker,
  openPicker: typeof showOpenFilePicker,
  savePicker: typeof showSaveFilePicker,
  orbitAction: Boolean(document.querySelector('#orbit-action')),
  orbitPanel: Boolean(document.querySelector('#orbit-panel')),
  createAction: Boolean(document.querySelector('[data-action="create-map"]')),
  recoveryOverlay: [...document.querySelectorAll('.recovery-backdrop,.recovery-dialog')].some((el) => !el.hidden),
  bodyText: document.body.innerText.slice(0, 200),
  headerText: document.querySelector('#app-header')?.innerText,
  status: document.querySelector('#shell-status')?.textContent,
  innerWidth, scrollWidth: document.documentElement.scrollWidth,
  navWidth: document.querySelector('#nav-rail')?.getBoundingClientRect().width,
  detailsWidth: document.querySelector('#details-panel')?.getBoundingClientRect().width,
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth
}))()`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
await writeFile(`${out}/browser-desktop-clean.png`, Buffer.from(shot.data, 'base64'));
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, session);
await new Promise((resolve) => setTimeout(resolve, 400));
const narrow = await evalJs(`(() => ({
  innerWidth, scrollWidth: document.documentElement.scrollWidth,
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  navRect: (() => { const r = document.querySelector('#nav-rail').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })(),
  detailsRect: (() => { const r = document.querySelector('#details-panel').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })(),
  headerText: document.querySelector('#app-header')?.innerText
}))()`);
const narrowShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
await writeFile(`${out}/browser-narrow-clean.png`, Buffer.from(narrowShot.data, 'base64'));
await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false }, session);
await new Promise((resolve) => setTimeout(resolve, 250));
await evalJs(`document.querySelector('[data-action="create-map"]')?.click()`);
await new Promise((resolve) => setTimeout(resolve, 300));
const choice = await evalJs(`(() => {
  const overlay = [...document.querySelectorAll('.orbit-choice-backdrop')].find((el) => !el.hidden);
  return { visible: Boolean(overlay), buttons: overlay ? [...overlay.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => b.textContent) : [], status: document.querySelector('#shell-status')?.textContent };
})()`);
const choiceShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
await writeFile(`${out}/browser-choice-clean.png`, Buffer.from(choiceShot.data, 'base64'));
await evalJs(`(() => { const overlay = [...document.querySelectorAll('.orbit-choice-backdrop')].find((el) => !el.hidden); const cancel = overlay && [...overlay.querySelectorAll('button')].find((b) => b.textContent === 'Cancel'); cancel?.click(); return true; })()`);
await send('Emulation.clearDeviceMetricsOverride', {}, session);
const report = { target: { id: created.targetId, url: 'http://127.0.0.1:8099/tests/harness/m5-exploration/' }, browserContext: context.browserContextId, desktop, narrow, choice, userAgentFromVersion: v.Browser, capturedAt: new Date().toISOString() };
await writeFile(`${out}/browser-evidence-clean.json`, JSON.stringify(report, null, 2), 'utf8');
await send('Target.closeTarget', { targetId: created.targetId });
await send('Target.disposeBrowserContext', { browserContextId: context.browserContextId });
ws.close();
console.log(JSON.stringify(report, null, 2));
