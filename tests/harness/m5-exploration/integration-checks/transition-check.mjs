import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'; const PORT=9390;
const browser=spawn(EDGE,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${process.cwd()}/.transition-check-profile`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
  const wait=async(fn,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sleep(60)}throw new Error('timeout')};
  const target=await wait(async()=>{await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();return(await(await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json())});
  ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let id=0;const pending=new Map();const browserErrors=[];
  ws.onmessage=(event)=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result)}if(msg.method==='Runtime.exceptionThrown')browserErrors.push(msg.params?.exceptionDetails?.exception?.description||msg.params?.exceptionDetails?.text)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  const ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
  const click=async(x,y,button='left')=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,clickCount:1});};
  const wheel=async(x,y,deltaY)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY});};
  const screenNode=async(nodeId)=>ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.id===${JSON.stringify(nodeId)});if(!n)return null;const p=v.screenOf(n),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y,nx:n.x,ny:n.y,opacity:n.opacity}})()`);
  const state=async()=>ev(`(()=>{const v=__M5_LARGE_MAP_VIEW__;return {focus:v.focusId,camera:v.camera,life:v.lifecycle(),duration:v.transitionDuration(),scene:v.scene().length}})()`);
  const clickNode=async(nodeId)=>{const p=await screenNode(nodeId);assert.ok(p,`node ${nodeId} must be hittable`);await click(p.x,p.y);};
  const settle=async()=>{await wait(()=>ev(`__M5_LARGE_MAP_VIEW__.lifecycle().geom===false&&__M5_LARGE_MAP_VIEW__.lifecycle().anim===false`),5000);};
  const load=async(name)=>{await ev(`(async()=>{const blob=await (await fetch('/tests/fixtures/large-map/${name}')).blob();return __M5_LARGE_MAP_TEST__.importFile(new File([blob],${JSON.stringify(name)}))})()`);await wait(()=>ev('!!window.__M5_LARGE_MAP_VIEW__'));await sleep(450)};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__M5_LARGE_MAP_TEST_HOOK__=true;'});
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1'});
  await wait(()=>ev("typeof __M5_LARGE_MAP_TEST__==='object'"));
  await load('FileOrbit-1000.orbit');
  const overview=await state();
  assert.equal(overview.duration,750,'initial duration must be 750ms'); assert.ok(overview.camera.scale>0.5,'initial camera must not use the 1x1 placeholder viewport');
  const catStart=await screenNode('cat-1');
  await click(catStart.x,catStart.y); const t0=Date.now();
  await sleep(140); const early=await state(); const earlyPos=await screenNode('cat-1');
  const align=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__,n=v.scene().find(x=>x.id==='cat-1'),l=v._state.labels.find(x=>x.id==='cat-1'),p=v.screenOf(n);return l?{dx:(l.x+l.w/2)-p.x,dy:(l.y+l.h/2)-p.y}:null})()"); assert.ok(align,'clicked category label must remain available during transition'); assert.equal(early.duration,750,'duration must remain configurable at 750ms'); assert.equal(early.life.geom,true,'geometry transition must be active'); assert.equal(early.life.anim,true,'camera transition must be active'); assert.ok(early.camera.scale>overview.camera.scale,'small branch must zoom in'); assert.ok(earlyPos && Math.abs(earlyPos.x-catStart.x)<80,'clicked folder must remain trackable');
  const labelPoint=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__,l=v._state.labels.find(x=>x.id==='cat-1'),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();return l?{x:r.left+l.x+l.w/2,y:r.top+l.y+l.h/2}:null})()"); assert.ok(labelPoint,'clicked category label must have a hit target'); await click(labelPoint.x,labelPoint.y); await sleep(100); const labelFocus=await state(); assert.equal(labelFocus.focus,'cat-1','label hit target must resolve to clicked category');
  await sleep(360); const middle=await state(); const middlePos=await screenNode('f-0'); assert.ok(middle.camera.scale>overview.camera.scale,'camera must zoom in progressively');
  const late=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__;v.stepTransitionForTest(749);const nodes=v.scene();return {life:v.lifecycle(),minOpacity:Math.min(...nodes.map(n=>n.opacity??1)),positions:nodes.map(n=>({id:n.id,x:n.x,y:n.y}))}})()");
  const completed=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__;v.stepTransitionForTest(750);const nodes=v.scene(),f=nodes.find(n=>n.id==='f-0');return {life:v.lifecycle(),positions:nodes.map(n=>({id:n.id,x:n.x,y:n.y})),sample:f?v.sampleNode('f-0'):null,finalScreen:f?v.screenOf(f):null}})()");
  let lateMaxDistance=0;for(const a of late.positions){const b=completed.positions.find(x=>x.id===a.id);if(b)lateMaxDistance=Math.max(lateMaxDistance,Math.hypot(a.x-b.x,a.y-b.y))} assert.equal(late.life.geom,true,'geometry must still be active just before endpoint'); assert.ok(late.minOpacity>0.95,'late new nodes must reach near-final opacity before endpoint'); assert.equal(completed.life.geom,false,'geometry must complete at endpoint'); assert.equal(completed.life.anim,false,'camera must complete at endpoint'); assert.ok(lateMaxDistance<2,'all node positions must be near-final before endpoint'); assert.deepEqual(completed.sample,[34,197,94,255],'final canvas must paint the final green file marker');
  await settle(); const catFinal=await state(); const catScreen=await screenNode('cat-1');
  assert.equal(catFinal.focus,'cat-1','category activation must focus cat-1'); assert.ok(catFinal.camera.scale>overview.camera.scale,'final framing must zoom in relative to the global overview'); assert.ok(catScreen,'clicked folder must remain in scene');
  const samePaths=await ev("(()=>{const out=[];const w=(n,p)=>{const h=p?p+' / '+n.name:n.name;if(n.name==='same-name.txt')out.push(h);for(const c of n.children||[])w(c,h)};w(__M5_P1B_TEST__.treeSnapshot(),'');return out})()"); assert.equal(samePaths.length,2,'fixture must retain two same-named files'); assert.notEqual(samePaths[0],samePaths[1],'same-named files must remain distinguishable by path');
  const labelInfo=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__,focus=v.scene().find(n=>n.id===v.focusId),childIds=new Set((focus?.node?.children||[]).map(c=>c.id)),labels=v._state.labels.filter(l=>l.kind==='node'),immediate=labels.filter(l=>childIds.has(l.id)),r=document.querySelector('[data-large-map] canvas').getBoundingClientRect();let overlap=0;for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)overlap++}const outside=labels.filter(l=>l.x<-2||l.y<-2||l.x+l.w>r.width+2||l.y+l.h>r.height+2).length,bgCentral=v.scene().filter(n=>n.background).filter(n=>{const p=v.screenOf(n);return p.x>r.width*0.35&&p.x<r.width*0.65&&p.y>r.height*0.35&&p.y<r.height*0.65}).length,pdf=labels.find(l=>/\.pdf$/i.test(l.text));return {children:childIds.size,labels:labels.length,immediate:immediate.length,overlap,outside,backgroundCentral:bgCentral,pdfColor:pdf?.color||null,minOpacity:Math.min(...labels.map(l=>l.opacity??1))}})()"); assert.equal(labelInfo.immediate,labelInfo.children,'every immediate active child must have a default filename label'); assert.ok(labelInfo.immediate>0,'immediate labels must be present'); assert.equal(labelInfo.overlap,0,'default labels must not overlap'); assert.equal(labelInfo.outside,0,'default labels must fit the viewport'); assert.equal(labelInfo.backgroundCentral,0,'background detail must not occupy the central active area'); assert.equal(labelInfo.pdfColor,'#F87171','PDF labels must remain red'); assert.ok(labelInfo.minOpacity>=0.45,'visible labels must be opaque enough');
  const foldersAfterCat=await ev("(()=>{const v=__M5_LARGE_MAP_VIEW__,r=document.querySelector('[data-large-map] canvas').getBoundingClientRect(),fs=v.scene().filter(n=>n.kind==='folder'),vis=fs.filter(n=>{const p=v.screenOf(n);return p.x>=0&&p.x<=r.width&&p.y>=0&&p.y<=r.height});return {total:fs.length,visible:vis.length,ids:vis.map(n=>n.id)}})()"); assert.equal(foldersAfterCat.visible,foldersAfterCat.total,'all global folders must remain visible after category framing'); assert.ok(foldersAfterCat.ids.includes('root')&&foldersAfterCat.ids.includes('cat-1')&&foldersAfterCat.ids.includes('cat-20'),'root and first-level categories must remain visible');
  await clickNode('nested-1'); const nestedMid=await state(); assert.equal(nestedMid.life.geom,true,'nested activation must animate geometry'); await settle(); const nestedFinal=await state(); assert.equal(nestedFinal.focus,'nested-1'); assert.ok(nestedFinal.camera.scale>=catFinal.camera.scale,'nested small branch should zoom closer');
  await clickNode('cat-2'); const bgMid=await state(); assert.equal(bgMid.life.geom,true,'direct larger/background category click must animate'); await settle(); const bgFinal=await state(); assert.equal(bgFinal.focus,'cat-2','direct background category click must focus cat-2'); assert.ok(bgFinal.camera.scale<nestedFinal.camera.scale,'larger branch must zoom out from nested');
  await ev(`document.querySelector('[data-large-map] button[title=Back]').click();true`); const backMid=await state(); assert.equal(backMid.life.geom,true,'Back must animate'); await settle(); const backFinal=await state(); assert.equal(backFinal.focus,'nested-1','Back must restore nested-1'); assert.ok(Math.abs(backFinal.camera.scale-nestedFinal.camera.scale)<0.15,'Back must restore nested framing');
  const crumbBefore=await ev("(()=>{const bs=[...document.querySelectorAll('#large-map-crumb button')];return {count:bs.length,texts:bs.map(b=>b.textContent),current:bs.find(b=>b.getAttribute('aria-current')==='page')?.textContent||null}})()"); assert.ok(crumbBefore.count>=3,'breadcrumb must show root and ancestors'); assert.equal(crumbBefore.current,'하위-폴더','current folder must be marked aria-current'); await ev("(()=>{const bs=[...document.querySelectorAll('#large-map-crumb button')];bs[1]?.click();return true})()"); await settle(); const crumbFinal=await state(); const crumbCurrent=await ev("document.querySelector('#large-map-crumb button[aria-current=page]')?.textContent||''"); assert.equal(crumbFinal.focus,'cat-1','middle breadcrumb must restore cat-1'); assert.ok(crumbCurrent.includes('기획'),'breadcrumb current must update after ancestor navigation');
  await ev("(()=>{const bs=[...document.querySelectorAll('#large-map-crumb button')];bs[0]?.click();return true})()"); const rootMid=await state(); assert.equal(rootMid.life.geom,true,'Root must animate'); await settle(); const rootFinal=await state(); assert.equal(rootFinal.focus,'root','Root must restore overview'); assert.ok(rootFinal.camera.scale<catFinal.camera.scale,'Root must zoom out to category overview');
  await clickNode('cat-1'); await sleep(150); const repeatStart=await state(); await clickNode('cat-2'); await settle(); const repeatFinal=await state(); assert.equal(repeatFinal.focus,'cat-2'); assert.notEqual(repeatStart.focus,repeatFinal.focus,'repeated click must retarget transition');
  await clickNode('cat-3'); await sleep(120); const interruptBefore=await state(); const posBefore=await screenNode('cat-3'); await wheel(800,500,120); const interrupted=await state(); const posAfter=await screenNode('cat-3'); assert.equal(interrupted.life.anim,false,'wheel must cancel camera animation'); assert.equal(interrupted.life.geom,true,'geometry must freeze, not jump'); assert.notEqual(interrupted.camera.scale,interruptBefore.camera.scale,'wheel must change camera'); assert.ok(posBefore&&posAfter&&Math.abs(posBefore.nx-posAfter.nx)<0.01&&Math.abs(posBefore.ny-posAfter.ny)<0.01,'frozen node world position must not jump');
  await sleep(300); const afterWait=await state(); const posWait=await screenNode('cat-3'); assert.equal(afterWait.life.anim,false); assert.ok(Math.abs(posWait.nx-posAfter.nx)<0.01&&Math.abs(posWait.ny-posAfter.ny)<0.01,'no delayed geometry jump after interruption');
  await clickNode('cat-1'); await sleep(120); const panBefore=await state(); const panPosBefore=await screenNode('cat-1'); await send('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:500,button:'left',buttons:1,clickCount:1}); await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:920,y:560,button:'left',buttons:1}); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:920,y:560,button:'left',buttons:0,clickCount:1}); await sleep(100); const panAfter=await state(); const panPosAfter=await screenNode('cat-1'); assert.equal(panAfter.life.anim,false,'pan must cancel camera animation'); assert.equal(panAfter.life.geom,true,'pan must freeze intermediate geometry'); assert.ok(panPosBefore&&panPosAfter&&Math.abs(panPosBefore.nx-panPosAfter.nx)<0.01,'pan must not snap frozen world geometry'); await sleep(250); const panWait=await state(); const panPosWait=await screenNode('cat-1'); assert.equal(panWait.life.anim,false); assert.ok(Math.abs(panPosWait.nx-panPosAfter.nx)<0.01,'pan interruption must not cause a delayed jump');
  await clickNode('cat-1'); await sleep(120); await ev(`(async()=>{const blob=await (await fetch('/tests/fixtures/large-map/FileOrbit-1000.orbit')).blob();return __M5_LARGE_MAP_TEST__.importFile(new File([blob],'FileOrbit-1000.orbit'))})()`); await wait(()=>ev(`window.__M5_LARGE_MAP_VIEW__&&__M5_LARGE_MAP_VIEW__.focusId==='root'`),10000); const replaced=await ev(`({focus:__M5_LARGE_MAP_VIEW__.focusId,life:__M5_LARGE_MAP_VIEW__.lifecycle()})`); assert.equal(replaced.life.anim,false,'replacement must cancel camera transition'); assert.equal(replaced.life.geom,false,'replacement must cancel geometry transition');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}); const reduced=await ev(`__M5_LARGE_MAP_VIEW__.transitionDuration()`); assert.equal(reduced,120,'reduced motion must shorten transition');
  assert.deepEqual(browserErrors,[],'no browser errors expected');
  console.log(JSON.stringify({align,labelFocus,labelInfo,samePaths,late,completed,lateMaxDistance,rootFinal,bgFinal,crumbBefore,crumbFinal,crumbCurrent,foldersAfterCat,pan:{before:panBefore.camera,after:panAfter.camera,pos:panPosAfter},overview,early:{camera:early.camera,cat:earlyPos,life:early.life},middle,catFinal,nestedFinal,bgFinal,backFinal,crumbFinal,repeat:{start:repeatStart.focus,final:repeatFinal.focus},interrupt:{before:interruptBefore.camera,after:interrupted.camera,frozenPos:posAfter,waited:afterWait.camera},replaced,reduced,browserErrors},null,2));
} finally { try{ws?.close()}catch{} try{process.kill(browser.pid)}catch{} }

























