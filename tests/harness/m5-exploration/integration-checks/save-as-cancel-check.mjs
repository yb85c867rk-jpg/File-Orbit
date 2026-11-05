import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'; const PORT=9385;
const browser=spawn(EDGE,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.cwd()}/.cancel-final3-profile`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
  const wait=async(fn,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sleep(100)}throw new Error('timeout')};
  const target=await wait(async()=>{await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();return(await(await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json())});
  ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let id=0;const pending=new Map();const browserErrors=[];
  ws.onmessage=(event)=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result)}if(msg.method==='Runtime.exceptionThrown')browserErrors.push(msg.params?.exceptionDetails?.exception?.description||msg.params?.exceptionDetails?.text)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  const ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
  const click=async(x,y,button='left')=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,clickCount:1});await sleep(400)};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__M5_LARGE_MAP_TEST_HOOK__=true;globalThis.__M5_P1B_TEST_HOOKS__=true;'});
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1'});
  await wait(()=>ev('typeof __M5_LARGE_MAP_TEST__==="object"&&!!__M5_P1B_TEST__'));
  const setup=await ev(`(async()=>{const bytes=new Uint8Array(await (await (await fetch('/tests/fixtures/large-map/FileOrbit-1000.orbit')).blob()).arrayBuffer());globalThis.__HB__=bytes;globalThis.__WRITES__=0;const handle={kind:'file',name:'cancel-final.orbit',queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getFile:async()=>new File([globalThis.__HB__],'cancel-final.orbit'),createWritable:async()=>({write:async(b)=>{globalThis.__HB__=new Uint8Array(await b.arrayBuffer());globalThis.__WRITES__+=1},close:async()=>{},abort:async()=>{}})};globalThis.__HANDLE__=handle;const r=await __M5_LARGE_MAP_TEST__.importWritable(new File([bytes],'FileOrbit-1000.orbit'),handle);return {ok:r.ok,size:bytes.length}})()`);
  assert.equal(setup.ok,true,'writable import must succeed'); await wait(()=>ev('window.__M5_LARGE_MAP_VIEW__')); await sleep(400);
  await ev('globalThis.__find=id=>{const w=n=>{if(n.id===id)return n;for(const c of n.children||[]){const r=w(c);if(r)return r}return null};return w(__M5_P1B_TEST__.treeSnapshot())}');
  const cat=await ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.id==='cat-1'),p=v.screenOf(n),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()`); await click(cat.x,cat.y);
  const file=await ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.kind==='file'&&x.active),p=v.screenOf(n),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()`); await click(file.x,file.y,'right'); await sleep(250);
  await ev(`[...document.querySelectorAll('[role=menuitem]')].find(b=>/Edit Data/.test(b.textContent))?.click();true`); await wait(()=>ev(`!document.querySelector('#editor-form').hidden`));
  const targetId=await ev(`(()=>{const n=document.querySelector('#editor-name');n.value='Cancel-Content-1000.txt';n.dispatchEvent(new Event('input',{bubbles:true}));return __M5_P1B_TEST__.editorState().targetId})()`);
  await ev(`document.querySelector('#editor-form button[type=submit]').click();true`); await sleep(1800);
  const saved=await ev(`({name:__find(${JSON.stringify(targetId)})?.name,writes:__WRITES__,dirty:__M5_P1B_TEST__.snapshot().dirty})`);
  assert.equal(saved.name,'Cancel-Content-1000.txt','saved metadata edit must apply'); assert.equal(saved.dirty,false,'editor save must be clean');
  const writesAfterSave=saved.writes;
  await ev('globalThis.__M5_DISABLE_AUTOMATIC_SAVE__=true;document.querySelector(\'#undo-history\').click();true'); await sleep(600);
  const unsaved=await ev(`({name:__find(${JSON.stringify(targetId)})?.name,dirty:__M5_P1B_TEST__.snapshot().dirty,writes:__WRITES__,handle:__M5_P1B_TEST__.documentState().handleName})`);
  assert.equal(unsaved.name,'중첩-문서.txt','Undo must restore prior content'); assert.equal(unsaved.dirty,true,'disabled automatic save must leave dirty state'); assert.equal(unsaved.writes,writesAfterSave,'disabled automatic save must not write');
  const hashBefore=await ev(`(async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',globalThis.__HB__))].map(x=>x.toString(16).padStart(2,'0')).join(''))()`);
  await ev(`globalThis.__PICKER_CALLS__=0;globalThis.showSaveFilePicker=async()=>{globalThis.__PICKER_CALLS__+=1;throw new DOMException('cancelled','AbortError')};document.querySelector('[data-action=save-document-as]').click();true`); await sleep(1200);
  const cancelled=await ev(`({pickers:__PICKER_CALLS__,name:__find(${JSON.stringify(targetId)})?.name,dirty:__M5_P1B_TEST__.snapshot().dirty,writes:__WRITES__,handleIdentity:__M5_P1B_TEST__.documentState().handle===__HANDLE__})`);
  const hashAfter=await ev(`(async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',globalThis.__HB__))].map(x=>x.toString(16).padStart(2,'0')).join(''))()`);
  assert.equal(cancelled.pickers,1,'Save As picker must be invoked'); assert.equal(cancelled.name,'중첩-문서.txt','cancelled Save As must preserve unsaved content'); assert.equal(cancelled.dirty,true,'cancelled Save As must preserve dirty state'); assert.equal(cancelled.writes,writesAfterSave,'cancelled Save As must not write'); assert.equal(cancelled.handleIdentity,true,'cancelled Save As must preserve handle object'); assert.equal(hashAfter,hashBefore,'cancelled Save As must preserve destination bytes');
  assert.deepEqual(browserErrors,[],'no browser errors expected');
  console.log(JSON.stringify({setup,saved,unsaved,cancelled:{...cancelled,hashBefore,hashAfter},browserErrors},null,2));
} finally { try{ws?.close()}catch{} try{process.kill(browser.pid)}catch{} }



