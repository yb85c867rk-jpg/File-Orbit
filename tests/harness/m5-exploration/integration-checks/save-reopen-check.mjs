import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9374;
const browser = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}/.save-reopen-check-profile`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  const wait = async (fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(100); } throw new Error('timeout'); };
  const target = await wait(async () => { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); return (await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()); });
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(); const browserErrors = [];
  ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); } if (msg.method === 'Runtime.exceptionThrown') browserErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const click = async (x, y, button = 'left') => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 }); await sleep(400); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__M5_LARGE_MAP_TEST_HOOK__=true;globalThis.__M5_P1B_TEST_HOOKS__=true;' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1' });
  await wait(() => ev('typeof __M5_LARGE_MAP_TEST__==="object"&&!!__M5_P1B_TEST__'));
  const setup = await ev(`(async()=>{const bytes=new Uint8Array(await (await (await fetch('/tests/fixtures/large-map/FileOrbit-1000.orbit')).blob()).arrayBuffer());globalThis.__HB__=bytes;globalThis.__WRITES__=0;const handle={kind:'file',name:'saved-1000.orbit',queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getFile:async()=>new File([globalThis.__HB__],'saved-1000.orbit'),createWritable:async()=>({write:async(b)=>{globalThis.__HB__=new Uint8Array(await b.arrayBuffer());globalThis.__WRITES__+=1},close:async()=>{},abort:async()=>{}})};globalThis.__HANDLE__=handle;const r=await __M5_LARGE_MAP_TEST__.importWritable(new File([bytes],'FileOrbit-1000.orbit'),handle);return {ok:r.ok,size:bytes.length}})()`);
  assert.equal(setup.ok, true, 'writable import must succeed');
  await wait(() => ev('!!window.__M5_LARGE_MAP_VIEW__'));
  await sleep(500);
  await ev('globalThis.__find=id=>{const w=n=>{if(n.id===id)return n;for(const c of n.children||[]){const r=w(c);if(r)return r}return null};return w(__M5_P1B_TEST__.treeSnapshot())}');
  const treeData = async () => ev(`(async()=>{const t=__M5_P1B_TEST__.treeSnapshot();const ids=[],topo=[],bindings=[];const snap=__M5_P1B_TEST__.attachmentSnapshot().entries;const byId=new Map(snap.map((entry)=>[entry.attachmentId,entry]));const w=async(n,pid,path)=>{const here=path?path+' / '+n.name:n.name;ids.push(n.id);topo.push([pid,n.id,n.kind]);if(n.data&&n.data.attachmentId){const entry=byId.get(n.data.attachmentId);if(!entry)throw new Error('missing attachment reference '+n.data.attachmentId+' at '+here);const name=entry.originalName||entry.name;const bytes=await __M5_P1B_TEST__.attachmentBytesById(n.data.attachmentId);if(!bytes&&entry.sizeBytes!==0)throw new Error('unreadable attachment '+n.data.attachmentId);const hash=bytes?[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''):null;bindings.push({nodeId:n.id,nodeName:n.name,path:here,attachmentId:n.data.attachmentId,originalName:name,size:entry.sizeBytes??entry.size??null,mime:entry.mime??null,hash})}for(const c of n.children||[])await w(c,n.id,here)};await w(t,null,'');return {ids,topo,count:ids.length,bindings}})()`);  const before = await treeData();
  assert.equal(before.count, 1000, 'initial document must have 1,000 nodes');
  assert.ok(before.bindings.length > 0, 'initial attachment-bearing nodes must be present');
  const sameName = before.bindings.filter((item) => item.originalName === 'same-name.txt');
  assert.equal(sameName.length, 2, 'fixture must contain two same-named attachments');
  assert.notEqual(sameName[0].hash, sameName[1].hash, 'same-named attachments must have different bytes');
  assert.equal(new Set(sameName.map((item) => item.attachmentId)).size, 2, 'same-named attachments must have distinct references');
  const cat = await ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.id==='cat-1'),p=v.screenOf(n),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()`);
  await click(cat.x, cat.y);
  const file = await ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.kind==='file'&&x.active),p=v.screenOf(n),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()`);
  await click(file.x, file.y, 'right'); await sleep(250);
  await ev(`[...document.querySelectorAll('[role=menuitem]')].find(b=>/Edit Data/.test(b.textContent))?.click();true`);
  await wait(() => ev(`!document.querySelector('#editor-form').hidden`));
  const targetId = await ev(`(()=>{const n=document.querySelector('#editor-name');n.value='Saved-Reopen-1000.txt';n.dispatchEvent(new Event('input',{bubbles:true}));const d=document.querySelector('#editor-description');d.value='save reopen verified';d.dispatchEvent(new Event('input',{bubbles:true}));return __M5_P1B_TEST__.editorState().targetId})()`);
  await ev(`document.querySelector('#editor-form button[type=submit]').click();true`);
  await sleep(2500);
  const afterEdit = await ev(`({target:__find(${JSON.stringify(targetId)})?.name,status:document.querySelector('#shell-status')?.textContent||'',formHidden:document.querySelector('#editor-form').hidden,dirty:__M5_P1B_TEST__.snapshot().dirty,writes:__WRITES__})`);
  assert.equal(afterEdit.target, 'Saved-Reopen-1000.txt', 'edited name must apply');
  assert.equal(afterEdit.formHidden, true, 'editor must close after save');
  assert.equal(afterEdit.dirty, false, 'editor save must leave clean state');
  await ev(`document.querySelector('#undo-history').click();true`); await sleep(500);
  const undo = await ev(`({name:__find(${JSON.stringify(targetId)})?.name,undo:__M5_P1B_TEST__.historyState().undo,redo:__M5_P1B_TEST__.historyState().redo})`);
  assert.equal(undo.name, '중첩-문서.txt', 'toolbar Undo must restore original name');
  await ev(`document.querySelector('#redo-history').click();true`); await sleep(500);
  const redo = await ev(`({name:__find(${JSON.stringify(targetId)})?.name,undo:__M5_P1B_TEST__.historyState().undo,redo:__M5_P1B_TEST__.historyState().redo})`);
  assert.equal(redo.name, 'Saved-Reopen-1000.txt', 'toolbar Redo must restore edited name');
  const saved = await ev(`(async()=>{const r=await __M5_LARGE_MAP_TEST__.saveCurrent();return {ok:r.ok,status:document.querySelector('#shell-status')?.textContent||'',writes:__WRITES__,size:__HB__.length,handle:__M5_P1B_TEST__.documentState().handleName,dirty:__M5_P1B_TEST__.snapshot().dirty}})()`);
  assert.equal(saved.ok, true, 'current-handle save must succeed');
  assert.equal(saved.dirty, false, 'save must leave clean state');
  const reopened = await ev(`(async()=>{const bytes=globalThis.__HB__;const r=await __M5_LARGE_MAP_TEST__.importWritable(new File([bytes],'saved-1000.orbit'),globalThis.__HANDLE__);return {ok:r.ok,size:bytes.length}})()`);
  assert.equal(reopened.ok, true, 'reopen through install pipeline must succeed');
  await wait(() => ev('window.__M5_EXPLORATION_STATUS__?.totalCount===1000'));
  await ev(`__M5_LARGE_MAP_VIEW__.reveal(${JSON.stringify(targetId)});__M5_P1B_TEST__.selectForTest(${JSON.stringify(targetId)});true`); await sleep(700);
  const after = await treeData();
  const final = await ev(`({name:__find(${JSON.stringify(targetId)})?.name,desc:__find(${JSON.stringify(targetId)})?.data?.description,details:document.querySelector('#details-content')?.innerText?.slice(0,120)||'',graph:__M5_LARGE_MAP_VIEW__.scene().find(x=>x.id===${JSON.stringify(targetId)})?.node.name||null,doc:__M5_P1B_TEST__.documentState(),snap:__M5_P1B_TEST__.snapshot(),handleIdentity:__M5_P1B_TEST__.documentState().handle===__HANDLE__})`);
  assert.equal(after.count, 1000, 'reopened document must have 1,000 nodes');
  assert.deepEqual(after.ids, before.ids, 'reopened IDs must match');
  assert.deepEqual(after.topo, before.topo, 'reopened topology must match');
  const bindingContent = (items) => items.map(({ nodeId, nodeName, originalName, size, mime, hash }) => ({ nodeId, nodeName, originalName, size, mime, hash })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  assert.deepEqual(bindingContent(after.bindings), bindingContent(before.bindings), 'per-node attachment bindings/metadata/hashes must match');
  const sameAfter = after.bindings.filter((item) => item.originalName === 'same-name.txt');
  assert.equal(sameAfter.length, 2, 'reopened same-named attachments must both remain');
  assert.notEqual(sameAfter[0].hash, sameAfter[1].hash, 'reopened same-named attachments must remain distinct');
  assert.equal(new Set(sameAfter.map((item) => item.attachmentId)).size, 2, 'reopened same-named attachments must have distinct references');
  assert.equal(final.name, 'Saved-Reopen-1000.txt', 'edited name must reopen');
  assert.equal(final.desc, 'save reopen verified', 'edited description must reopen');
  assert.match(final.details, /Saved-Reopen-1000\.txt/, 'Details must agree');
  assert.equal(final.graph, 'Saved-Reopen-1000.txt', 'graph must agree');
  assert.equal(final.doc.handleName, 'saved-1000.orbit', 'handle identity must be retained');
  assert.equal(final.handleIdentity, true, 'same writable handle object must be retained');
  assert.equal(final.snap.dirty, false, 'reopened state must be clean');
  assert.deepEqual(browserErrors, [], 'no browser errors expected');
  console.log(JSON.stringify({ setup, before: { count: before.count, bindings: before.bindings }, afterEdit, undo, redo, saved, reopened, after: { count: after.count, idsEqual: true, topologyEqual: true, bindingsEqual: true }, final, browserErrors }, null, 2));
} finally {
  try { ws?.close(); } catch {}
  try { process.kill(browser.pid); } catch {}
}





