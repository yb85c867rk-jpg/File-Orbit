import { spawn, execSync } from 'node:child_process'; import { writeFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const sha=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim(); const profile=process.cwd()+'/.rename-r3-opfs-profile'; const port=9617; const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true}); const sl=ms=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
 const wait=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sl(60)}throw new Error('timeout: '+label)};
 const target=await wait(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok?r.json():null},'target'); ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject}); let id=0; const pending=new Map(), errors=[]; ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.reject(m.error):q.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text)}; const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))}); const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html'});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'app');
 const result=await ev(`(async()=>{
   const r3=await import('/src/engine/hypertree/rename/index.js?r3=' + Date.now());
   const backup=await import('/src/engine/hypertree/persistence/backup.js?r3=' + Date.now());
   const cryptoApi=globalThis.crypto; const digest=async blob=>Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
   const attachmentBytes=new Uint8Array([65,66,67,68,69]); const attachmentFile=new File([attachmentBytes],'payload.bin',{type:'application/octet-stream'});
   const registry={get(id){return id==='att_source'?{file:attachmentFile,metadata:{originalName:'payload.bin',sizeBytes:5,mime:'application/octet-stream'},name:'payload.bin',classification:null}:null}};
   const tree={id:'root',kind:'folder',name:'Old Map',data:{},children:[{id:'file-1',kind:'file',name:'Payload',data:{attachmentId:'att_source',originalName:'payload.bin',sizeBytes:5,mime:'application/octet-stream'},children:[]}]};
   const sourceEncoded=await backup.encodeBackup({tree,registry,mapName:'Old Map.orbit',cryptoApi});
   const root=await navigator.storage.getDirectory(); const unique='rename-r3-opfs-'+Date.now(); const parent=await root.getDirectoryHandle(unique,{create:true});
   const source=await parent.getFileHandle('Old Map.orbit',{create:true}); const sourceWritable=await source.createWritable(); await sourceWritable.write(sourceEncoded.blob); await sourceWritable.close();
   const sourceFile=await source.getFile(); const sourceDigest=await digest(sourceFile);
   const counts={list:0,create:0,write:0,remove:0,move:0,permissionRequest:0};
   const entries=[]; for await (const [name,handle] of parent.entries()) entries.push({name,handle,kind:handle.kind,type:handle.kind});
   let matchedEntry=null; const markedEntries=[]; for(const e of entries){const same=await e.handle.isSameEntry(source); const marked=same?{...e,active:true}:e; markedEntries.push(marked); if(same)matchedEntry=marked;}
   const parentResult={ok:true,parent:{handle:parent,name:unique,libraryId:'lib-opfs'},entry:matchedEntry,entries:markedEntries,candidates:[]};
   const current={datasetToken:'r3-opfs',session:1,ownership:2,revision:3,handle:source,documentIdentity:'orbit:r3-opfs',savedRevision:3};
   const plan=r3.buildRenamePreflight({tree,activeHandle:source,activeDocumentName:'Old Map.orbit',documentIdentity:'orbit:r3-opfs',baseline:{handle:source,documentIdentity:'orbit:r3-opfs',digest:sourceDigest,size:sourceFile.size},current,captured:{...current},parent:parentResult,proposedName:'New Map',backend:'opfs'});
   const candidate=await r3.prepareRenameCandidate({plan,tree,registry,cryptoApi});
   const adapter={
     async getFileHandle(_directory,name){return parent.getFileHandle(name)},
     async listEntries(){counts.list++; const values=[]; for await (const [name,handle] of parent.entries()) values.push({name,handle,kind:handle.kind}); return {ok:true,entries:values,truncated:false}},
     async createFile(_directory,name){counts.create++; return {ok:true,handle:await parent.getFileHandle(name,{create:true})}},
     async writeFile(handle,blob){counts.write++; const writable=await handle.createWritable(); try{await writable.write(blob);await writable.close();return {ok:true,close:true}}catch(error){try{await writable.abort()}catch{};return {ok:false,reason:'write-failed',message:String(error?.message||error)}}},
     async removeFile(_directory,name,{expectedHandle,expectedSize,expectedLastModified}){counts.remove++; const handle=await parent.getFileHandle(name); if(!(await handle.isSameEntry(expectedHandle))) return {ok:false,reason:'target-changed'}; const file=await handle.getFile(); if(file.size!==expectedSize||Number(file.lastModified)!==Number(expectedLastModified)) return {ok:false,reason:'target-changed'}; await parent.removeEntry(name,{recursive:false}); return {ok:true}}
   };
   const executor=r3.createRenameExecutor({adapter,cryptoApi});
   const outcome=await executor.execute({plan,candidate,permissions:{sourceRead:true,parentRead:true,parentWrite:true,sourceRemove:true},getState:()=>({datasetToken:'r3-opfs',session:1,ownership:2,revision:3,handle:source,documentIdentity:'orbit:r3-opfs'}),isCancelled:()=>false});
   const names=[]; for await (const [name] of parent.entries()) names.push(name);
   let postError=null,decodedTitle=null,decodedMapName=null,decodedAttachmentBytes=null,newPresent=false,oldPresent=false;
   try{const newHandle=await parent.getFileHandle('New Map.orbit'); const newBlob=await newHandle.getFile(); const decoded=await backup.decodeBackup(newBlob,{cryptoApi}); decodedTitle=decoded.tree.name; decodedMapName=decoded.manifest.mapName; decodedAttachmentBytes=Array.from(new Uint8Array(await decoded.attachments[0].blob.arrayBuffer()));}catch(error){postError=String(error?.message||error)}
   oldPresent=names.includes('Old Map.orbit'); newPresent=names.includes('New Map.orbit');
   return {plan:{kind:plan.kind,title:plan.title,filename:plan.filename,manifestName:candidate?.manifest?.mapName ?? null},outcome,names,counts,decodedTitle,decodedMapName,decodedAttachmentBytes,oldPresent,newPresent,postError,planError:plan.ok?null:plan, candidateError:candidate.ok?null:candidate, sourcePresent:!!source};
 })()`);
 assert.equal(result.outcome.ok,true);
 assert.equal(result.outcome.status,'filesystem-complete-adoption-required');
 assert.deepEqual(result.outcome.mutations,{createCalls:1,writeCalls:1,removeCalls:1});
 assert.deepEqual(result.names,['New Map.orbit']);
 assert.equal(result.counts.move,0);
 assert.equal(result.counts.permissionRequest,0);
 assert.equal(result.plan.manifestName,'New Map.orbit');
 assert.equal(result.decodedTitle,'New Map');
 assert.equal(result.decodedMapName,'New Map.orbit');
 assert.deepEqual(result.decodedAttachmentBytes,[65,66,67,68,69]);
 console.log(JSON.stringify({sha,result,errors},null,2));
} finally {try{ws?.close()}catch{}try{process.kill(browser.pid)}catch{}}
