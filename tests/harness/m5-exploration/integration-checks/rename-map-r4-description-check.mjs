import { spawn, execSync } from 'node:child_process'; import { writeFileSync, rmSync } from 'node:fs'; import assert from 'node:assert/strict';
const sha=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim(); const profile=process.cwd()+'/.r4-description-profile'; rmSync(profile,{recursive:true,force:true}); const port=9631; const b=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true}); const sl=ms=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
 const wait=async(fn,label,ms=40000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sl(100)}throw new Error('timeout: '+label)};
 const tar=await wait(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok?r.json():null},'target'); ws=new WebSocket(tar.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j}); let id=0; const pending=new Map(), errors=[]; ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.j(m.error):q.r(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text)}; const send=(method,params={})=>new Promise((r,j)=>{const n=++id;pending.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}); const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}; const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync('evidence/large-map/'+n,Buffer.from(r.data,'base64'))};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__M5_LARGE_MAP_TEST_HOOK__=true;globalThis.__M5_P1B_TEST_HOOKS__=true;'});await send('Emulation.setDeviceMetricsOverride',{width:1900,height:870,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html'});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'app');
 const DESCRIPTION='설명 첫 줄\n둘째 줄 signature ✓';
 await ev("(async()=>{const backup=await import('/src/engine/hypertree/persistence/backup.js');const settingsMod=await import('/tests/harness/m5-exploration/map-library-settings.js');const storage=await navigator.storage.getDirectory();const dir=await storage.getDirectoryHandle('R4 Description Library',{create:true});const bytes=new Uint8Array([65,66,67,68,69]);const af=new File([bytes],'seq.txt',{type:'text/plain'});const registry={get(id){return id==='att_seq'?{file:af,metadata:{originalName:'seq.txt',sizeBytes:5,mime:'text/plain'},name:'seq.txt',classification:null}:null}};for(const [name,title,description] of [['A.orbit','Map A','initial'],['Other.orbit','Other Map','other initial']]){const tree={id:'root',kind:'folder',name:title,data:{description},children:[{id:'f',kind:'file',name:'Doc',data:{attachmentId:'att_seq',originalName:'seq.txt',sizeBytes:5,mime:'text/plain'},children:[]}]};const e=await backup.encodeBackup({tree,registry,mapName:name,cryptoApi:globalThis.crypto});const f=await dir.getFileHandle(name,{create:true});const w=await f.createWritable();await w.write(e.blob);await w.close();}globalThis.__R4_DIR__=dir;globalThis.__R4_BYTES__=Array.from(bytes);const settings=settingsMod.createMapLibrarySettings({indexedDB});await settings.saveCollection([{id:'lib-desc',handle:dir,name:'R4 Description Library'}],'lib-desc');return true})()");
 await send('Page.reload',{ignoreCache:true});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'reload');await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='R4 Description Library'"),'library');await ev("(async()=>{const storage=await navigator.storage.getDirectory();globalThis.__R4_DIR__=await storage.getDirectoryHandle('R4 Description Library');return true})()");await sl(500);
 const openMap=async name=>{await ev("(()=>{[...document.querySelectorAll('#orbit-list .orbit-entry')].find(x=>x.textContent.includes("+JSON.stringify(name)+")).click();return true})()");await wait(()=>ev("document.querySelector('#shell-status')?.textContent?.includes("+JSON.stringify(name)+")"),'open '+name);await sl(600)};
 const treeSnapshot=()=>ev("({title:__M5_P1B_TEST__.treeSnapshot().name,description:__M5_P1B_TEST__.treeSnapshot().data?.description||null,dirty:__M5_P1B_TEST__.automaticSaveState().dirty})");
 const decode=async name=>ev("(async()=>{const backup=await import('/src/engine/hypertree/persistence/backup.js');const names=[];for await(const [n] of globalThis.__R4_DIR__.entries())names.push(n);const f=await globalThis.__R4_DIR__.getFileHandle("+JSON.stringify(name)+");const d=await backup.decodeBackup(await f.getFile(),{cryptoApi:globalThis.crypto});return {names:names.sort(),title:d.tree.name,description:d.tree.data?.description??null,bytes:Array.from(new Uint8Array(await d.attachments[0].blob.arrayBuffer()))}})()");
 const rootMenu=async()=>{await ev("__M5_P1B_TEST__.openRootMenuAtForTest(300,300)");await wait(()=>ev("document.querySelector('#editor-context-menu')?.hidden===false"),'menu')};
 const openDescription=async()=>{await rootMenu();await ev("(()=>{document.querySelector('#editor-context-menu button[data-action=\\\"edit-description\\\"]').click();return true})()");await wait(()=>ev("document.querySelector('#editor-form')?.hidden===false"),'desc form');await sl(150)};
 const rename=async name=>{await rootMenu();await ev("(()=>{document.querySelector('#editor-context-menu button[data-action=\\\"rename-map\\\"]').click();return true})()");await wait(()=>ev("document.querySelector('.rename-map-backdrop')?.hidden===false"),'rename dialog');await ev("(()=>{const i=document.querySelector('#rename-map-name');i.value="+JSON.stringify(name)+";i.dispatchEvent(new Event('input',{bubbles:true}));return true})()");await wait(()=>ev("document.querySelector('#rename-map-preview')?.textContent==="+JSON.stringify(name+'.orbit')),'preview');await ev("(()=>{document.querySelector('.rename-map-dialog .embed-dialog-actions button:last-child').click();return true})()");await wait(()=>ev("document.querySelector('.rename-map-backdrop')?.hidden===true"),'renamed '+name,30000);await sl(700)};
 const diagnostics=()=>ev("(()=>{const d=globalThis.__M5_EDITOR_DIAGNOSTIC__;if(!d)return null;return {schema:d.schema,action:d.action,stage:d.stage,reason:d.reason,changed:d.changed,appliedRetained:d.appliedRetained,revisionEqual:d.revisionEqual,write:d.write}})()");
 await openMap('A.orbit');
 // 1. Rename A -> B, then edit the description and Save without reopening.
 const calls={create:0,write:0,remove:0}; await ev("globalThis.__M5_RENAME_CALLS__={create:0,write:0,remove:0};true");
 await rename('B');
 const afterRename=await decode('B.orbit'); const afterRenameSnapshot=await treeSnapshot();
 assert.deepEqual(afterRename.names,['B.orbit','Other.orbit']);assert.equal(afterRename.title,'B');assert.equal(afterRename.description,'initial');assert.equal(afterRenameSnapshot.title,'B');assert.equal(afterRenameSnapshot.description,'initial');
 const renameCalls=await ev("({...globalThis.__M5_RENAME_CALLS__})");assert.deepEqual(renameCalls,{create:1,write:1,remove:1});
 await openDescription();
 const prefilled=await ev("({action:__M5_P1B_TEST__.editorState().action,value:document.querySelector('#editor-description')?.value,nameVisible:!document.querySelector('#editor-name')?.closest('.editor-field')?.hidden,linkVisible:!document.querySelector('#editor-link')?.closest('.editor-field')?.hidden})");
 assert.equal(prefilled.action,'edit-description');assert.equal(prefilled.value,'initial');assert.equal(prefilled.nameVisible,false);assert.equal(prefilled.linkVisible,false);
 // Korean IME: compose, commit, then Save.
 await ev("(()=>{const d=document.querySelector('#editor-description');d.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));d.value="+JSON.stringify(DESCRIPTION)+";d.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:"+JSON.stringify(DESCRIPTION)+"}));d.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:"+JSON.stringify(DESCRIPTION)+"}));return d.value})()");
 await ev("document.querySelector('#editor-form button[type=submit]').click();true");
 await wait(()=>ev("document.querySelector('#editor-form')?.hidden===true"),'description saved',40000);
 await sl(500); await shot('r4-description-after-save.png');
 const savedDiagnostic=await diagnostics();
 assert.equal(savedDiagnostic?.schema,'fileorbit-editor-outcome-v1');assert.equal(savedDiagnostic.action,'edit-description');assert.equal(savedDiagnostic.stage,'saved');assert.equal(savedDiagnostic.reason,'persisted-verified');assert.equal(savedDiagnostic.changed.description,true);assert.equal(savedDiagnostic.write.confirmed,true);assert.equal(savedDiagnostic.write.decoded,true);
 const afterDescription=await decode('B.orbit'); assert.equal(afterDescription.description,DESCRIPTION);assert.equal(afterDescription.title,'B');
 // 2. Open an unrelated map, then return to B through the Library and check the displayed value.
 await openMap('Other.orbit'); const otherBefore=await decode('Other.orbit');
 await openMap('B.orbit'); const reopened=await treeSnapshot(); assert.equal(reopened.title,'B'); assert.equal(reopened.description,DESCRIPTION);
 await openDescription(); const reopenedField=await ev("document.querySelector('#editor-description')?.value"); assert.equal(reopenedField,DESCRIPTION); await shot('r4-description-reopened.png');
 await ev("(()=>{document.querySelector('#editor-form .editor-actions button:last-child').click();return true})()"); await wait(()=>ev("document.querySelector('#editor-form')?.hidden===true"),'desc closed');
 // 2b. Genuine no-op is visibly reported and writes nothing.
 const bytesBeforeNoop=await decode('B.orbit'); await openDescription();
 await ev("document.querySelector('#editor-form button[type=submit]').click();true");
 await wait(()=>ev("document.querySelector('#editor-form')?.hidden===true"),'noop closed'); await sl(300);
 const noopDiagnostic=await diagnostics(); const noopFeedback=await ev("(()=>{const t=document.querySelector('#folder-export-success');return {toast:t?.textContent||'',hidden:t?.hidden??null,shell:document.querySelector('#shell-status')?.textContent||''}})()");
 assert.equal(noopDiagnostic.reason,'no-change');assert.equal(noopDiagnostic.stage,'apply');assert.equal(noopDiagnostic.changed.description,false);
 assert.match(noopFeedback.toast,/No changes/i);assert.equal(noopFeedback.hidden,false);
 const bytesAfterNoop=await decode('B.orbit'); assert.deepEqual(bytesAfterNoop,bytesBeforeNoop);
 // 3. Rename B -> C with the editor closed; verify title, filename, description and exact attachment bytes.
 await rename('C');
 const afterSecondRename=await decode('C.orbit'); const secondSnapshot=await treeSnapshot(); const otherAfter=await decode('Other.orbit');
 assert.deepEqual(afterSecondRename.names,['C.orbit','Other.orbit']);assert.equal(afterSecondRename.title,'C');assert.equal(afterSecondRename.description,DESCRIPTION);assert.deepEqual(afterSecondRename.bytes,[65,66,67,68,69]);
 assert.equal(secondSnapshot.title,'C');assert.equal(secondSnapshot.description,DESCRIPTION);
 assert.equal(otherAfter.names.includes('Other.orbit'),true);assert.equal(otherAfter.names.includes('B.orbit'),false);assert.equal(otherAfter.title,'Other Map');assert.equal(otherAfter.description,'other initial');assert.deepEqual(otherAfter.bytes,otherBefore.bytes);
 // 4. An open editor still blocks Rename with a clear explanation and retains pending input.
 await openDescription(); await ev("(()=>{const d=document.querySelector('#editor-description');d.value='pending draft text';d.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 await rootMenu(); const menuHasRename=await ev("Boolean(document.querySelector('#editor-context-menu button[data-action=\\\"rename-map\\\"]'))");
 await ev("(()=>{document.querySelector('#editor-context-menu button[data-action=\\\"rename-map\\\"]').click();return true})()"); await sl(400);
 const blocked=await ev("({dialog:document.querySelector('.rename-map-backdrop')?.hidden!==false,status:document.querySelector('#shell-status')?.textContent||'',draft:document.querySelector('#editor-description')?.value||''})");
 assert.equal(menuHasRename,true);assert.equal(blocked.dialog,true);assert.match(blocked.status,/Save or cancel|edit/i);assert.equal(blocked.draft,'pending draft text');
 await shot('r4-description-rename-blocked.png');
 const finalC=await decode('C.orbit'); assert.deepEqual(finalC.names,['C.orbit','Other.orbit']);assert.equal(finalC.description,DESCRIPTION);
 await ev("(()=>{document.querySelector('#editor-form .editor-actions button:last-child').click();return true})()");
 // 5. A changed description that cannot be written keeps the applied edit for retry and shows the reason.
 const RETRY_TEXT=DESCRIPTION+'\n재시도 줄';
 await openDescription(); await ev("globalThis.__M5_SAVE_ENCODE_FAILURE__=true;(()=>{const d=document.querySelector('#editor-description');d.value=" + JSON.stringify(RETRY_TEXT) + ";d.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 await ev("document.querySelector('#editor-form button[type=submit]').click();true");
 await wait(()=>ev("__M5_EDITOR_DIAGNOSTIC__?.reason?.includes('encoding')===true"),'encode failure diagnostic',30000);
 const unsaved=await ev("({formHidden:document.querySelector('#editor-form')?.hidden,error:document.querySelector('#editor-error')?.textContent||'',status:document.querySelector('#editor-status')?.textContent||'',shell:document.querySelector('#shell-status')?.textContent||'',toast:document.querySelector('#folder-export-success')?.textContent||'',draft:document.querySelector('#editor-description')?.value||'',retry:[...document.querySelectorAll('#editor-form button')].some(b=>b.textContent==='Retry Save'&&!b.hidden)})");
 const unsavedDiagnostic=await diagnostics();
 assert.equal(unsaved.formHidden,false);assert.equal(unsaved.draft,RETRY_TEXT);assert.equal(unsaved.retry,true);assert.equal(unsavedDiagnostic.stage,'encoding');
 assert.equal(unsavedDiagnostic.appliedRetained,true);assert.match(unsaved.shell + ' ' + unsaved.toast + ' ' + unsaved.status,/couldn.t save|still open|Retry Save/i);
 const duringFailure=await decode('C.orbit'); assert.equal(duringFailure.description,DESCRIPTION);
 await ev("globalThis.__M5_SAVE_ENCODE_FAILURE__=false;true");
 await ev("(()=>{[...document.querySelectorAll('#editor-form button')].find(b=>b.textContent==='Retry Save').click();return true})()");
 await wait(()=>ev("document.querySelector('#editor-form')?.hidden===true"),'retry saved',40000); await sl(400);
 const retryDiagnostic=await diagnostics(); const afterRetry=await decode('C.orbit');
 assert.equal(retryDiagnostic.reason,'persisted-verified');assert.equal(retryDiagnostic.write.decoded,true);assert.equal(afterRetry.description,RETRY_TEXT);
 assert.deepEqual(afterRetry.names,['C.orbit','Other.orbit']);
 assert.equal(errors.length,0);
 console.log(JSON.stringify({sha,description:DESCRIPTION,afterRename,renameCalls,prefilled,savedDiagnostic,afterDescription,reopened,reopenedField,noopDiagnostic,noopFeedback,afterSecondRename,secondSnapshot,otherAfter,blocked,unsaved,unsavedDiagnostic,duringFailure,retryDiagnostic,afterRetry,errors},null,2));
} finally {try{ws?.close()}catch{}try{process.kill(b.pid)}catch{}}
