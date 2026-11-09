import { spawn, execSync } from 'node:child_process'; import { writeFileSync, rmSync } from 'node:fs'; import assert from 'node:assert/strict';
const sha=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim(); const profile=process.cwd()+'/.library-folder-recovery-profile'; rmSync(profile,{recursive:true,force:true}); const port=9644; const b=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true}); const sl=ms=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
 const wait=async(fn,label,ms=40000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sl(110)}throw new Error('timeout: '+label)};
 const tar=await wait(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok?r.json():null},'target'); ws=new WebSocket(tar.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j}); let id=0; const pending=new Map(), errors=[]; ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.j(m.error):q.r(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text)}; const send=(method,params={})=>new Promise((r,j)=>{const n=++id;pending.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}); const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}; const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync('evidence/large-map/'+n,Buffer.from(r.data,'base64'))};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__M5_LARGE_MAP_TEST_HOOK__=true;globalThis.__M5_P1B_TEST_HOOKS__=true;'});await send('Emulation.setDeviceMetricsOverride',{width:1900,height:870,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html'});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'app');
 await ev("(async()=>{const backup=await import('/src/engine/hypertree/persistence/backup.js');const settingsMod=await import('/tests/harness/m5-exploration/map-library-settings.js');const root=await navigator.storage.getDirectory();const A=await root.getDirectoryHandle('Recovery A',{create:true});const B=await root.getDirectoryHandle('Recovery B',{create:true});await root.getDirectoryHandle('Recovery Dest',{create:true});const mk=async(dir,name,title,desc,bytes)=>{const arr=new Uint8Array(bytes||[65,66,67,68,69]);const af=new File([arr],'seq.txt',{type:'text/plain'});const registry={get(id){return id==='att_seq'?{file:af,metadata:{originalName:'seq.txt',sizeBytes:arr.length,mime:'text/plain'},name:'seq.txt',classification:null}:null}};const tree={id:'root',kind:'folder',name:title,data:{description:desc},children:[{id:'f',kind:'file',name:'Doc',data:{attachmentId:'att_seq',originalName:'seq.txt',sizeBytes:arr.length,mime:'text/plain'},children:[]}]};const e=await backup.encodeBackup({tree,registry,mapName:name,cryptoApi:globalThis.crypto});const f=await dir.getFileHandle(name,{create:true});const w=await f.createWritable();await w.write(e.blob);await w.close()};await mk(A,'A.orbit','Map A','initial');await mk(A,'Other.orbit','Other A','other initial');await mk(B,'B.orbit','Map B','b initial');const settings=settingsMod.createMapLibrarySettings({indexedDB});await settings.saveCollection([{id:'lib-rec-a',handle:A,name:'Recovery A'},{id:'lib-rec-b',handle:B,name:'Recovery B'}],'lib-rec-a');return true})()");
 await send('Page.reload',{ignoreCache:true});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'reload');await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery A'"),'library A');
 await ev("(async()=>{const backup=await import('/src/engine/hypertree/persistence/backup.js');const root=await navigator.storage.getDirectory();globalThis.__ROOT__=root;globalThis.__A__=await root.getDirectoryHandle('Recovery A');globalThis.__B__=await root.getDirectoryHandle('Recovery B');globalThis.__DEST__=await root.getDirectoryHandle('Recovery Dest');globalThis.__mk=async(dir,name,title,desc,bytes)=>{const arr=new Uint8Array(bytes||[65,66,67,68,69]);const af=new File([arr],'seq.txt',{type:'text/plain'});const registry={get(id){return id==='att_seq'?{file:af,metadata:{originalName:'seq.txt',sizeBytes:arr.length,mime:'text/plain'},name:'seq.txt',classification:null}:null}};const tree={id:'root',kind:'folder',name:title,data:{description:desc},children:[{id:'f',kind:'file',name:'Doc',data:{attachmentId:'att_seq',originalName:'seq.txt',sizeBytes:arr.length,mime:'text/plain'},children:[]}]};const e=await backup.encodeBackup({tree,registry,mapName:name,cryptoApi:globalThis.crypto});const f=await dir.getFileHandle(name,{create:true});const w=await f.createWritable();await w.write(e.blob);await w.close()};globalThis.__decode=async(name,dir)=>{const baseName=name.split(':')[0];const d=dir||(baseName==='B'?globalThis.__B__:(baseName==='M'?await globalThis.__ROOT__.getDirectoryHandle('Recovery A Moved'):globalThis.__A__));const f=await d.getFileHandle(name.includes(':')?name.split(':')[1]:name);const file=await f.getFile();const dec=await backup.decodeBackup(file,{cryptoApi:globalThis.crypto});return {title:dec.tree.name,description:dec.tree.data?.description??null,bytes:Array.from(new Uint8Array(await dec.attachments[0].blob.arrayBuffer()))}};globalThis.__mkMoved=async()=>{const moved=await globalThis.__ROOT__.getDirectoryHandle('Recovery A Moved',{create:true});await globalThis.__mk(moved,'A.orbit','Moved Map','moved body',[77,77,77]);await globalThis.__mk(moved,'Other.orbit','Other Moved','other moved');globalThis.__MOVED__=moved;return true};return true})()");
 const rows=()=>ev("[...document.querySelectorAll('#orbit-list .orbit-entry')].map(b=>b.querySelector('.orbit-entry-name')?.textContent||'')");
 const toast=()=>ev("document.querySelector('#folder-export-success')?.textContent||''");
 const orbitName=()=>ev("document.querySelector('#orbit-name')?.textContent||''");
 const orbitStatus=()=>ev("document.querySelector('#orbit-status')?.textContent||''");
 const clickRefresh=async()=>{await ev("document.querySelector('#orbit-refresh').click();true");await sl(700)};
 const openMap=async name=>{await ev("(()=>{[...document.querySelectorAll('#orbit-list .orbit-entry')].find(b=>b.querySelector('.orbit-entry-name')?.textContent==="+JSON.stringify(name)+")?.click();return true})()");await wait(()=>ev("__M5_P1B_TEST__.documentState()?.name==="+JSON.stringify(name)),'open '+name);await sl(400)};
 const save=()=>ev("(async()=>{const r=await __M5_P1B_TEST__.saveDocumentForTest();return {ok:r.ok,reason:r.reason||null,message:String(r.message||'')}})()");
 const libState=()=>ev("(()=>{const s=__M5_P1B_TEST__.libraryCollectionStateForTest();return {selectedId:s?.selectedId||null,libraries:(s?.libraries||[]).map(l=>({id:l.id,name:l.name})),count:(s?.libraries||[]).length}})()");
 const openEdit=async()=>{await ev("document.querySelector('#library-edit').click();true");await wait(()=>ev("getComputedStyle(document.querySelector('.library-edit-backdrop')).display!=='none'"),'edit dialog');await sl(150)};
 // 1. Folder deleted: Refresh keeps the list, keeps the map, and points at Change linked folder.
 await openMap('A.orbit');
 const mapBefore=await ev("({title:__M5_P1B_TEST__.treeSnapshot().name,description:__M5_P1B_TEST__.treeSnapshot().data?.description||null,name:__M5_P1B_TEST__.documentState().name})");
 await ev("(async()=>{const root=await navigator.storage.getDirectory();await root.removeEntry('Recovery A',{recursive:true});return true})()");
 await clickRefresh();
 await wait(()=>ev("document.querySelector('#folder-export-success')?.textContent?.includes('Change linked folder')"),'missing folder notice',15000);
 const missing=await ev("({toast:document.querySelector('#folder-export-success')?.textContent||'',panel:document.querySelector('#orbit-status')?.textContent||'',editVisible:document.querySelector('#library-edit')?.hidden===false,reconnectVisible:document.querySelector('#orbit-reconnect')?.hidden===false,doc:__M5_P1B_TEST__.documentState().name,title:__M5_P1B_TEST__.treeSnapshot().name})");
 assert.match(missing.toast,/can’t open this folder/i);assert.match(missing.toast,/Change linked folder/i);assert.match(missing.toast,/out of date/i);assert.equal(missing.editVisible,true);assert.equal(missing.doc,'A.orbit');assert.equal(missing.title,'Map A');
 const staleNames=await rows();assert.equal(staleNames.includes('A.orbit'),true,'last list was not retained');
 const missingSave=await save();assert.equal(missingSave.ok,false);assert.equal(missingSave.reason,'destination-missing');await shot('library-folder-missing.png');
 // 2. Select the moved folder through Change linked folder; the Library ID stays stable.
 await ev("__mkMoved()");
 await ev("window.showDirectoryPicker=async()=>globalThis.__MOVED__;true");
 await openEdit();
 await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Choose Folder').click();return true})()");
 await wait(()=>ev("document.querySelector('#library-edit-replacement')?.textContent==='Recovery A Moved'"),'replacement selected',15000);
 const beforeIds=await libState();
 await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Apply').click();return true})()");
 await wait(()=>ev("getComputedStyle(document.querySelector('.library-edit-backdrop')).display==='none'"),'edit applied',20000);
 await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery A Moved'"),'moved selected',20000);await sl(600);
 const afterIds=await libState(); const movedNames=await rows(); const relinkToast=await toast();
 assert.equal(afterIds.count,2);assert.equal(afterIds.selectedId,'lib-rec-a');assert.equal(afterIds.libraries.find(l=>l.id==='lib-rec-a').name,'Recovery A Moved');
 assert.equal(beforeIds.libraries.find(l=>l.id==='lib-rec-a').name,'Recovery A');
 assert.deepEqual(movedNames.sort(),['A.orbit','Other.orbit']);assert.match(relinkToast,/Linked folder changed|open map/i);
 await shot('library-folder-reconnected.png');
 // Same-named file in the replacement folder gets zero writes from the old map.
 const movedBefore=await ev("(async()=>__decode('M:A.orbit'))()");
 const oldMapSave=await save();assert.equal(oldMapSave.ok,false);assert.equal(oldMapSave.reason,'destination-missing');
 assert.deepEqual(await ev("(async()=>__decode('M:A.orbit'))()"),movedBefore);
 // Save As preserves the open edits in a separate file.
 await ev("__M5_P1B_TEST__.openRootMenuAtForTest(300,300);true");await wait(()=>ev("document.querySelector('#editor-context-menu')?.hidden===false"),'menu');await ev("(()=>{document.querySelector('#editor-context-menu button[data-action=\\\"edit-description\\\"]').click();return true})()");await wait(()=>ev("document.querySelector('#editor-form')?.hidden===false"),'desc form');
 await ev("(()=>{const d=document.querySelector('#editor-description');d.value='recovery edits kept';d.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 await ev("document.querySelector('#editor-form button[type=submit]').click();true");
 await wait(()=>ev("__M5_EDITOR_DIAGNOSTIC__?.reason==='destination-missing'"),'applied missing',30000);
 await ev("window.showOpenFilePicker=async()=>[];window.showSaveFilePicker=async()=>{const real=await __DEST__.getFileHandle('Recovered.orbit',{create:true});return {kind:'file',name:'Recovered.orbit',async queryPermission(){return 'granted'},async requestPermission(){return 'granted'},async isSameEntry(o){try{return real.isSameEntry?await real.isSameEntry(o):false}catch{return false}},async createWritable(){return real.createWritable()},async getFile(){return real.getFile()}}};true");
 await ev("(()=>{[...document.querySelectorAll('#editor-form button')].find(b=>b.textContent==='Save As').click();return true})()");
 await wait(()=>ev("document.querySelector('#editor-form')?.hidden===true"),'save as closed',40000);await sl(300);
 const recovered=await ev("(async()=>__decode('Recovered.orbit',__DEST__))()");assert.equal(recovered.description,'recovery edits kept');assert.deepEqual(recovered.bytes,[65,66,67,68,69]);
 assert.deepEqual(await ev("(async()=>__decode('M:A.orbit'))()"),movedBefore);
 // Opening the file from the reconnected Library establishes the new binding only after opening.
 await openMap('A.orbit');assert.equal(await ev("__M5_P1B_TEST__.treeSnapshot().name"),'Moved Map');
 const newBindingSave=await save();assert.equal(newBindingSave.ok,true);
 await ev("(async()=>{await globalThis.__MOVED__.removeEntry('A.orbit');return true})()");
 const afterDelete=await save();assert.equal(afterDelete.ok,false);assert.equal(afterDelete.reason,'destination-missing');
 // Reload restores the reconnected Library.
 await send('Page.reload',{ignoreCache:true});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'reload2');await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery A Moved'"),'moved after reload',20000);await sl(500);
 const reloadState={name:await orbitName(),names:await rows(),lib:await libState()};
 assert.equal(reloadState.name,'Recovery A Moved');assert.deepEqual(reloadState.names,['Other.orbit']);assert.equal(reloadState.lib.selectedId,'lib-rec-a');
 // 3. Cancel and duplicate rules for Change linked folder.
 await ev("(async()=>{globalThis.__B__=await (await navigator.storage.getDirectory()).getDirectoryHandle('Recovery B');return true})()");
 await ev("window.showDirectoryPicker=async()=>{throw new DOMException('cancelled','AbortError')};true");
 await openEdit();await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Choose Folder').click();return true})()");await sl(700);
 const cancelState=await ev("({status:document.querySelector('#library-edit-status')?.textContent||'',current:document.querySelector('#library-edit-current')?.textContent||'',open:getComputedStyle(document.querySelector('.library-edit-backdrop')).display!=='none'})");
 assert.match(cancelState.status,/cancel|Choose/i);assert.equal(cancelState.current,'Recovery A Moved');assert.equal(cancelState.open,true);
 await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Cancel').click();return true})()");await sl(300);
 const afterCancel=await libState();assert.equal(afterCancel.libraries.find(l=>l.id==='lib-rec-a').name,'Recovery A Moved');
 // Duplicate selection selects the existing Library instead of creating another record.
 await ev("window.showDirectoryPicker=async()=>globalThis.__B__;true"); await openEdit();
 await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Choose Folder').click();return true})()");
 await wait(()=>ev("document.querySelector('#library-edit-replacement')?.textContent==='Recovery B'"),'duplicate picked',15000);
 await ev("(()=>{[...document.querySelectorAll('.library-edit-dialog button')].find(b=>b.textContent==='Apply').click();return true})()");
 await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery B'"),'duplicate selected',20000); await sl(500);
 const duplicateState=await libState();assert.equal(duplicateState.count,2);assert.equal(duplicateState.selectedId,'lib-rec-b');
 assert.match(await toast(),/already linked|existing Map Library/i);
 // 3b. Permission denial offers Reconnect; reconnecting keeps the same Library record.
 await ev("__M5_P1B_TEST__.setMapLibraryPermissionStateForTest('denied');true"); await sl(500);
 const deniedState=await ev("({reconnect:document.querySelector('#orbit-reconnect')?.hidden===false,panel:document.querySelector('#orbit-status')?.textContent||'',toast:document.querySelector('#folder-export-success')?.textContent||''})");
 assert.equal(deniedState.reconnect,true);assert.match(deniedState.panel+' '+deniedState.toast,/can’t read this folder|Reconnect Map Library/i);
 await ev("document.querySelector('#orbit-reconnect').click();true"); await sl(900);
 await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery B'"),'reconnected B',20000); await sl(700);
 const reconnectedState=await libState();assert.equal(reconnectedState.count,2);assert.equal(reconnectedState.selectedId,'lib-rec-b');
 assert.match(await toast(),/connected|reconnected|current map/i); await shot('library-folder-reconnect.png');
 // 4. Delayed refresh followed by a Library switch cannot replace the newer list.
 await ev("__M5_P1B_TEST__.selectLibraryForTest('lib-rec-a');true");
 await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery A Moved'"),'back to A',20000);await sl(500);
 await ev("__M5_P1B_TEST__.deferOrbitRefresh();true");
 await ev("document.querySelector('#orbit-refresh').click();true");
 await wait(()=>ev("Boolean(globalThis.__M5_ORBIT_REFRESH_GATE__?.started)"),'refresh gate',15000);
 await ev("__M5_P1B_TEST__.selectLibraryForTest('lib-rec-b');true");
 await wait(()=>ev("globalThis.__M5_ORBIT_REFRESH_GATE__?.calls>=2"),'B listing reached',20000);
 await wait(()=>ev("document.querySelector('#orbit-name')?.textContent==='Recovery B'"),'switch to B',20000);
 await ev("__M5_P1B_TEST__.releaseOrbitRefresh();true");await sl(900);
 assert.equal(await orbitName(),'Recovery B');assert.deepEqual(await rows(),['B.orbit']);
 assert.equal(errors.length,0);
 console.log(JSON.stringify({sha,mapBefore,missing,missingSave,staleNames,beforeIds,afterIds,movedNames,relinkToast,movedBefore,oldMapSave,recovered,reloadState,cancelState,afterCancel,duplicateState,deniedState,reconnectedState,errors},null,2));
} finally {try{ws?.close()}catch{}try{process.kill(b.pid)}catch{}}