import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeBackup } from '../../src/engine/hypertree/persistence/backup.js';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9250; const BASE='http://127.0.0.1:8142/tests/harness/m5-exploration/index.html';
const outDir=new URL('./', import.meta.url); mkdirSync(outDir,{recursive:true});
const profile=new URL(`./.orbit-browser-profile-${process.pid}/`, import.meta.url);
const browser=spawn(EDGE,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${decodeURIComponent(profile.pathname).replace(/^\//,'')}`,'--no-first-run','--disable-gpu','--hide-scrollbars','--window-size=1500,900','--disable-extensions','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=20000,label='condition'){const end=Date.now()+timeout;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw new Error('timeout '+label);}
const target=await waitFor(async()=>{const v=await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();if(!v.webSocketDebuggerUrl)return null;return(await(await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json());},20000,'target');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
let seq=0;const pending=new Map();const events=[];ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method)events.push({method:m.method,params:m.params});if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}});
function send(method,params={}){const id=++seq;return new Promise((res,rej)=>{pending.set(id,{resolve:res,reject:rej});ws.send(JSON.stringify({id,method,params}));});}
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__M5_P1B_TEST_HOOKS__=true;globalThis.__STROKES__=[];(()=>{const p=CanvasRenderingContext2D.prototype;const o=p.stroke;p.stroke=function(...a){try{globalThis.__STROKES__.push({strokeStyle:String(this.strokeStyle),globalAlpha:this.globalAlpha,lineWidth:this.lineWidth});}catch{}return o.apply(this,a);};})();`});
await send('Page.navigate',{url:BASE});
const start=Date.now();await waitFor(async()=>{const r=await send('Runtime.evaluate',{expression:'document.readyState==="complete" && typeof window.__M5_P1B_TEST__==="object"',returnByValue:true});return r.result.value;},30000,'app');const loadMs=Date.now()-start;
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name,outDir),Buffer.from(r.data,'base64'));}
async function mouse(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await sleep(100);}
async function click(selector){const c=await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);if(!c)throw new Error('missing '+selector);await mouse(c.x,c.y);}
const initial=await ev('({ready:true,hasMap:Boolean(__M5_P1B_TEST__.snapshot().mapId),status:document.querySelector("#shell-status").textContent,initError:globalThis.__BROWSER_INIT_ERROR__||null,hasBrowser:globalThis.__BROWSER_HAS__||null})');
const pdfClassification={format:'pdf',badge:'PDF',needsReview:false};
const pdfBytes=new TextEncoder().encode('%PDF-1.7\nFileOrbit PDF preview');
const pdfFile=new File([pdfBytes],'보고서.pdf',{type:'application/pdf'});
const sampleRegistry=new Map([['att_pdf',{file:pdfFile,metadata:{originalName:'보고서.pdf',sizeBytes:pdfBytes.length,mime:'application/pdf',classification:pdfClassification}}]]);
const sampleTree={id:'root',name:'한국어 PDF Orbit',kind:'folder',data:{},children:[{id:'pdf-node',name:'보고서.pdf',kind:'file',data:{dataType:'file',description:'PDF 문서',attachmentId:'att_pdf',originalName:'보고서.pdf',sizeBytes:pdfBytes.length,mime:'application/pdf',classification:pdfClassification}},{id:'folder-node',name:'자료',kind:'folder',data:{},children:[{id:'text-node',name:'메모.txt',kind:'file',data:{description:'검색 경로 대상'}}]}]};
const encodedSample=await encodeBackup({tree:sampleTree,registry:sampleRegistry,mapName:'PDF sample',cryptoApi:globalThis.crypto});
const b64=Buffer.from(new Uint8Array(await encodedSample.blob.arrayBuffer())).toString('base64');
const setup=await ev(`(()=>{
  const bytes=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));
  let permissionMode='granted';
  class FileHandle { constructor(name,blob,kind='file'){this.name=name;this.kind=kind;this._blob=blob;this.lastModified=Date.now();} async getFile(){return new File([this._blob],this.name,{type:'application/x-orbit',lastModified:this.lastModified});} async queryPermission(){return permissionMode;} async requestPermission(){return permissionMode;} }
  class DirHandle { constructor(name,entries,{denyRead=false}={}){this.name=name;this.kind='directory';this.entries=entries;this.denyRead=denyRead;} async *values(){for(const [name,handle] of Object.entries(this.entries))yield [name,handle];} async getDirectoryHandle(name){const h=this.entries[name];if(!h||h.kind!=='directory'){const e=new Error('not found');e.name='NotFoundError';throw e;}return h;} async getFileHandle(name){const h=this.entries[name];if(!h||h.kind!=='file'){const e=new Error('not found');e.name='NotFoundError';throw e;}return h;} async queryPermission({mode}){return this.denyRead&&mode==='read'?'denied':'granted';} async requestPermission({mode}){return this.denyRead&&mode==='read'?'denied':'granted';} }
  const nested=new DirHandle('Nested',{'deep.orbit':new FileHandle('deep.orbit',bytes),'notes.txt':new FileHandle('notes.txt',new Blob(['n']))});
  const projects=new DirHandle('Projects',{'Nested':nested,'team.orbit':new FileHandle('team.orbit',bytes),'notes.txt':new FileHandle('notes.txt',new Blob(['n']))});
  const empty=new DirHandle('Empty',{});
  const root=new DirHandle('Orbit Root',{'Projects':projects,'Empty':empty,'root.orbit':new FileHandle('root.orbit',bytes),'notes.txt':new FileHandle('notes.txt',new Blob(['n']))});
  const denied=new DirHandle('Denied Orbit',{'blocked.orbit':new FileHandle('blocked.orbit',bytes)},{denyRead:true});
  globalThis.__orbitRoots={root,projects,nested,empty,denied,bytes};
  globalThis.__orbitPickerCalls=0;globalThis.__orbitPickerMode=null;
  globalThis.window.showDirectoryPicker=async({mode}={})=>{globalThis.__orbitPickerCalls++;globalThis.__orbitPickerMode=mode;return globalThis.__orbitPickerRoot||root;};
  return {pickerCalls:globalThis.__orbitPickerCalls};
})()`);
const report={environment:{userAgent:await ev('navigator.userAgent'),product:(await send('Browser.getVersion')).product,viewport:{width:1500,height:900}},loadMs,initial,setup,errors:[]};
async function isBrowserOpen(){return ev('Boolean(document.querySelector(".file-open-browser-backdrop:not([hidden])"))');}
async function modal(){return ev(`(()=>{const o=document.querySelector('.file-open-browser-backdrop:not([hidden])');if(!o)return null;const r=o.getBoundingClientRect();return {text:o.textContent,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},rows:[...o.querySelectorAll('[data-entry-kind]')].map(b=>({name:b.textContent,kind:b.dataset.entryKind,key:b.dataset.entryKey})),breadcrumb:[...o.querySelectorAll('[data-breadcrumb-index]')].map(b=>b.textContent),buttons:[...o.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled,action:b.dataset.openBrowser||null})),current:o.querySelector('.orbit-folder-browser-current')?.textContent,status:o.querySelector('.file-open-browser-status')?.textContent};})()`);}
try {
  await click('#nav-rail-toggle'); await sleep(300);
  await click('#open-orbit-action'); await sleep(150);
  report.menuState=await ev(`({hidden:document.querySelector('#open-orbit-menu').hidden,html:document.querySelector('#open-orbit-menu').outerHTML.slice(0,500),runChoice:globalThis.__RUNCHOICE__||null,attempt:globalThis.__OPEN_ATTEMPT__||null,component:Boolean(globalThis.__BROWSER_COMPONENT__),elementParent:globalThis.__BROWSER_COMPONENT__?.element?.parentElement?.id||null,hostHtml:document.querySelector('#overlay-host')?.outerHTML.slice(0,300)||null,hostId:globalThis.__BROWSER_COMPONENT__?.host?.id||null,hostConnected:globalThis.__BROWSER_COMPONENT__?.host?.isConnected??null,hostChildren:globalThis.__BROWSER_COMPONENT__?.host?.children?.length??null,elementConnected:globalThis.__BROWSER_COMPONENT__?.element?.isConnected??null})`);
  await ev("document.querySelector('#open-orbit-menu [data-open-kind=\"folder\"]').click(); true"); await sleep(250);
  report.openInitial=await modal();
  if (!report.openInitial) {
    report.directCall=await ev('(async()=>{try{await globalThis.__OPEN_FOLDER__();return {ok:true};}catch(e){return {error:String(e?.stack||e)};}})()');
    await sleep(300);
    report.openAfterDirect=await modal();
    report.attemptAfter=await ev('globalThis.__OPEN_ATTEMPT__||null');
    report.runChoice=await ev('globalThis.__RUNCHOICE__||null');
    report.openBlocked=await ev('globalThis.__OPEN_BLOCKED__||null');
    report.shell=await ev('document.querySelector("#shell-status").textContent');
  }
  await shot('01-open-initial.png');
  await click('button[data-open-browser="choose-folder"]'); await sleep(350);
  report.afterChoose=await modal(); await shot('02-root-contents.png');
  const projectRow=await ev(`(()=>{const rows=[...document.querySelectorAll('.file-open-browser-backdrop:not([hidden]) [data-entry-kind="folder"]')];const row=rows.find(b=>b.textContent.includes('Projects'));const r=row.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`); await mouse(projectRow.x,projectRow.y); await sleep(250);
  report.projects=await modal(); await shot('03-projects.png');
  const nestedRow=await ev(`(()=>{const rows=[...document.querySelectorAll('.file-open-browser-backdrop:not([hidden]) [data-entry-kind="folder"]')];const row=rows.find(b=>b.textContent.includes('Nested'));const r=row.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`); await mouse(nestedRow.x,nestedRow.y); await sleep(250);
  report.nested=await modal(); await shot('04-nested.png');
  await click('button[data-open-browser="up"]'); await sleep(200); report.up=await modal();
  await click('button[data-open-browser="refresh"]'); await sleep(250); report.refresh=await modal();
  await click('button[data-open-browser="connect"]'); await sleep(500);
  report.connected=await ev(`({name:document.querySelector('#orbit-name').textContent,sectionHidden:document.querySelector('#orbit-section').hidden,list:[...document.querySelectorAll('#orbit-list .orbit-entry')].map(b=>b.textContent),mapId:__M5_P1B_TEST__.snapshot().mapId,status:document.querySelector('#shell-status').textContent})`); await shot('05-connected-sidebar.png');
  await click('#open-orbit-action'); await sleep(120); await click('#open-orbit-menu [data-open-kind="folder"]'); await sleep(300); report.reopenedConnected=await modal(); await shot('06-reopened-connected.png');
  await click('button[data-open-browser="cancel"]'); await sleep(120); report.cancelClosed=!await isBrowserOpen();
  // native picker cancel while keeping current folder
  await click('#open-orbit-action'); await sleep(100); await click('#open-orbit-menu [data-open-kind="folder"]'); await sleep(250);
  await ev(`(()=>{window.__orbitPickerRoot=null;window.showDirectoryPicker=async()=>{const e=new Error('cancelled');e.name='AbortError';throw e;};return true;})()`);
  await click('button[data-open-browser="choose-folder"]'); await sleep(200); report.pickerCancel=await modal(); await shot('07-picker-cancel.png');
  await ev(`(()=>{window.__orbitPickerRoot=globalThis.__orbitRoots.root;window.showDirectoryPicker=async({mode}={})=>{globalThis.__orbitPickerCalls++;globalThis.__orbitPickerMode=mode;return window.__orbitPickerRoot;};return true;})()`);
  // permission denial
  await ev('window.__orbitPickerRoot=globalThis.__orbitRoots.denied; true'); await click('button[data-open-browser="choose-folder"]'); await sleep(300); report.denied=await modal(); await shot('08-denied.png');
  await ev('window.__orbitPickerRoot=globalThis.__orbitRoots.projects; true'); await click('button[data-open-browser="choose-folder"]'); await sleep(300); report.projectsAgain=await modal();
  // select and open document
  const fileRow=await ev(`(()=>{const rows=[...document.querySelectorAll('.file-open-browser-backdrop:not([hidden]) [data-entry-kind="file"]')];const row=rows.find(b=>b.textContent.includes('team.orbit'));const r=row.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`); await mouse(fileRow.x,fileRow.y); await sleep(120); report.selected=await modal(); await shot('09-file-selected.png');
  await click('button[data-open-browser="open"]'); await sleep(1200); report.openedDocument=await ev(`({browser:Boolean(document.querySelector('.file-open-browser-backdrop:not([hidden])')),document:{active:__M5_P1B_TEST__.documentState().active,name:__M5_P1B_TEST__.documentState().name,mode:__M5_P1B_TEST__.documentState().mode,handleName:__M5_P1B_TEST__.documentState().handleName},status:document.querySelector('#shell-status').textContent,mapId:__M5_P1B_TEST__.snapshot().mapId})`); await shot('10-opened-document.png');
  // Sidebar Refresh after explicit Connect.
  await click('#orbit-refresh'); await sleep(400);
  report.sidebarRefresh=await ev(`({name:document.querySelector('#orbit-name').textContent,list:[...document.querySelectorAll('#orbit-list .orbit-entry')].map(b=>b.textContent),status:document.querySelector('#orbit-status').textContent})`);
  // Unsaved replacement prompt through the existing pipeline; Cancel preserves the current map.
  await ev('__M5_P1B_TEST__.touch(); true'); await sleep(60);
  await click('#open-orbit-action'); await sleep(100); await ev("document.querySelector('#open-orbit-menu [data-open-kind=\"folder\"]').click(); true"); await sleep(350);
  const dirtyRow=await ev(`(()=>{const rows=[...document.querySelectorAll('.file-open-browser-backdrop:not([hidden]) [data-entry-kind="file"]')];const row=rows.find(b=>b.textContent.includes('team.orbit'));const r=row.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`); await mouse(dirtyRow.x,dirtyRow.y); await sleep(80); await click('button[data-open-browser="open"]'); await sleep(400);
  report.unsavedPrompt=await ev(`(()=>{const p=document.querySelector('.unsaved-map-backdrop:not([hidden])');return p?{text:p.textContent,buttons:[...p.querySelectorAll('button')].map(b=>b.textContent)}:null;})()`); await shot('11-unsaved-cancel.png');
  if(report.unsavedPrompt){const cancel=await ev(`(()=>{const p=document.querySelector('.unsaved-map-backdrop:not([hidden])');const b=[...p.querySelectorAll('button')].find(x=>x.textContent==='Cancel');if(!b)return false;b.click();return true;})()`); await sleep(300); report.unsavedCancel={clicked:cancel,...await ev(`({name:__M5_P1B_TEST__.documentState().name,handleName:__M5_P1B_TEST__.documentState().handleName,dirty:__M5_P1B_TEST__.snapshot().dirty,browser:Boolean(document.querySelector('.file-open-browser-backdrop:not([hidden])'))})`)};}
  await click('#open-orbit-action'); await sleep(100); await ev("document.querySelector('#open-orbit-menu [data-open-kind=\"folder\"]').click(); true"); await sleep(350);
  const discardRow=await ev(`(()=>{const rows=[...document.querySelectorAll('.file-open-browser-backdrop:not([hidden]) [data-entry-kind="file"]')];const row=rows.find(b=>b.textContent.includes('team.orbit'));if(!row)return false;row.click();return true;})()`); await sleep(80); await click('button[data-open-browser="open"]'); await sleep(400);
  report.discardPrompt=await ev(`(()=>{const p=document.querySelector('.unsaved-map-backdrop:not([hidden])');if(!p)return null;const b=[...p.querySelectorAll('button')].find(x=>x.textContent==='Discard changes');if(!b)return {text:p.textContent,clicked:false};b.click();return {text:p.textContent,clicked:true};})()`); await sleep(1200);
  report.discardResult=await ev(`({dirty:__M5_P1B_TEST__.snapshot().dirty,name:__M5_P1B_TEST__.documentState().name,handleName:__M5_P1B_TEST__.documentState().handleName,status:document.querySelector('#shell-status').textContent})`);
  await waitFor(async()=> await ev('!__M5_P1B_TEST__.snapshot().dirty && !__M5_P1B_TEST__.snapshot().guard && !__M5_P1B_TEST__.snapshot().busy'), 10000, 'clean map before search');
  await ev('__M5_P1B_TEST__.clearShellStatusForTest(); true');
  // Actual search path and PDF styling.
  await click('#search-toggle'); await sleep(100);
  await ev(`(()=>{const input=document.querySelector('#search-reserved');input.value='자료';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  report.searchQueryState=await ev(`({panelHidden:document.querySelector('#search-panel').hidden,value:document.querySelector('#search-reserved').value,tree:Boolean(__M5_P1B_TEST__.treeSnapshot()),status:document.querySelector('#search-results .search-status')?.textContent||null,cards:[...document.querySelectorAll('.search-card')].map(c=>c.textContent)})`);
  report.searchDirect=await ev(`(()=>{const input=document.querySelector('#search-reserved');input.dispatchEvent(new Event('input',{bubbles:true}));return {value:input.value};})()`); await sleep(300);
  report.searchAfterEvent=await ev(`({status:document.querySelector('#search-results .search-status')?.textContent||null,cards:[...document.querySelectorAll('.search-card')].map(c=>c.textContent)})`);
  await waitFor(async()=> (await ev("document.querySelectorAll('.search-card').length"))>0, 4000, 'search cards');
  report.searchPath=await ev(`({state:__M5_P1B_TEST__.searchHighlightState(),strokes:globalThis.__STROKES__.slice(-120)})`);
  report.searchPathActive=await ev("__SET_SEARCH_ACTIVE__('folder-node')"); await sleep(350);
  report.searchPathActiveState=await ev(`({state:__M5_P1B_TEST__.searchHighlightState(),strokes:globalThis.__STROKES__.slice(-120)})`); await shot('12-search-path.png');
  await ev(`(()=>{const input=document.querySelector('#search-reserved');input.value='보고서';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await waitFor(async()=> (await ev("[...document.querySelectorAll('.search-card')].some(c=>c.textContent.includes('보고서.pdf'))")), 4000, 'pdf card');
  const pdfResult=await ev(`(()=>{const c=[...document.querySelectorAll('.search-card')].find(x=>x.textContent.includes('보고서.pdf'));if(!c)return false;c.click();return true;})()`); await sleep(900);
  report.pdfPreviewOpen=await ev("__M5_P1B_TEST__.openAttachmentByName('보고서.pdf')"); await waitFor(async()=> await ev("Boolean(document.querySelector('.attachment-viewer-backdrop:not([hidden])'))"), 3000, 'pdf viewer');
  report.pdfSearch=await ev(`(()=>{const label=[...document.querySelectorAll('[data-vd-label-id]')].find(g=>g.textContent.includes('보고서.pdf'));const badge=label?.querySelector('[data-vd-badge]');const viewer=document.querySelector('.attachment-viewer-backdrop:not([hidden])');return {label:Boolean(label),labelColor:label?getComputedStyle(label).color:null,badgeText:badge?.textContent||null,badgeColor:badge?getComputedStyle(badge).color:null,viewer:Boolean(viewer),viewerText:viewer?.textContent.slice(0,80)||null,state:__M5_P1B_TEST__.searchHighlightState(),strokes:globalThis.__STROKES__.slice(-120)};})()`); await shot('13-pdf-search.png');
  const viewerClose=await ev(`(()=>{const v=document.querySelector('.attachment-viewer-backdrop:not([hidden])');if(!v)return false;const b=[...v.querySelectorAll('button')].find(x=>x.textContent==='Close');if(!b)return false;b.click();return true;})()`); await sleep(250);
  report.pdfAfterPreview=await ev(`(()=>{const label=[...document.querySelectorAll('[data-vd-label-id]')].find(g=>g.textContent.includes('보고서.pdf'));const badge=label?.querySelector('[data-vd-badge]');return {closed:!document.querySelector('.attachment-viewer-backdrop:not([hidden])'),labelColor:label?getComputedStyle(label).color:null,badgeColor:badge?getComputedStyle(badge).color:null,classification:__M5_P1B_TEST__.searchHighlightState().scenePresent};})()`); report.viewerClose=viewerClose; await shot('13b-pdf-after-preview.png');
  await ev(`(()=>{const input=document.querySelector('#search-reserved');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`); await sleep(400);
  report.searchCleared=await ev(`(()=>{const label=[...document.querySelectorAll('[data-vd-label-id]')].find(g=>g.textContent.includes('보고서.pdf'));const badge=label?.querySelector('[data-vd-badge]');return {state:__M5_P1B_TEST__.searchHighlightState(),labelColor:label?getComputedStyle(label).color:null,badgeColor:badge?getComputedStyle(badge).color:null,redLabels:[...document.querySelectorAll('[data-vd-label-id]')].filter(g=>getComputedStyle(g).color==='rgb(231, 76, 60)').length};})()`); await shot('14-search-cleared.png');
  // Theme consistency and viewport/focus containment.
  await click('#settings-action'); await sleep(80); await click('#theme-action'); await sleep(250);
  report.lightTheme=await ev(`(()=>{const label=[...document.querySelectorAll('[data-vd-label-id]')].find(g=>g.textContent.includes('보고서.pdf'));const badge=label?.querySelector('[data-vd-badge]');return {theme:document.documentElement.dataset.theme||null,labelColor:label?getComputedStyle(label).color:null,badgeColor:badge?getComputedStyle(badge).color:null};})()`); await shot('15-light-pdf.png');
  await send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false}); await sleep(200);
  await click('#open-orbit-action'); await sleep(100); await ev("document.querySelector('#open-orbit-menu [data-open-kind=\"folder\"]').click(); true"); await sleep(300);
  report.smallViewport=await modal(); await shot('16-small-viewport.png');
  const focusBefore=await ev('document.activeElement?.dataset?.openBrowser||document.activeElement?.id||null');
  await ev(`(()=>{const b=document.querySelector('button[data-open-browser="choose-folder"]');b.focus();return document.activeElement===b;})()`); await ev(`(()=>{const o=document.querySelector('.file-open-browser-backdrop:not([hidden])');o.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;})()`); await sleep(150);
  report.focus={before:focusBefore,after:await ev('document.activeElement?.id||null'),open:await isBrowserOpen()};
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false});
} catch(e) { report.errors.push(String(e?.stack||e)); }
report.pickerCalls=await ev('globalThis.__orbitPickerCalls'); report.pickerMode=await ev('globalThis.__orbitPickerMode');
report.events=events.filter((event)=>event.method==='Runtime.exceptionThrown'||event.method==='Log.entryAdded').slice(-20);
writeFileSync(new URL('ui-evidence.json',outDir),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2)); ws.close(); try{process.kill(browser.pid,'SIGTERM');}catch{}

















