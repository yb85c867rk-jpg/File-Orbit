import { spawn, execSync } from 'node:child_process'; import { writeFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const sha=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim(); const profile=process.cwd()+'/.rename-r2-opfs-profile'; const port=9616; const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore',windowsHide:true}); const sl=ms=>new Promise(r=>setTimeout(r,ms)); let ws;
try {
 const wait=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sl(60)}throw new Error('timeout: '+label)};
 const target=await wait(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok?r.json():null},'target'); ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject}); let id=0; const pending=new Map(), errors=[]; ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const q=pending.get(m.id);pending.delete(m.id);m.error?q.reject(m.error):q.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text)}; const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))}); const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.navigate',{url:'http://127.0.0.1:8164/tests/harness/m5-exploration/index.html'});await wait(()=>ev("typeof __M5_P1B_TEST__==='object'"),'app');
 const result=await ev(`(async()=>{
   const mod=await import('/src/engine/hypertree/rename/index.js?opfs=' + Date.now());
   const root=await navigator.storage.getDirectory();
   const unique='rename-r2-opfs-'+Date.now();
   const parent=await root.getDirectoryHandle(unique,{create:true});
   const source=await parent.getFileHandle('Map.orbit',{create:true});
   const writable=await source.createWritable(); await writable.write(new Blob(['exact-orbit-bytes'],{type:'application/x-orbit'})); await writable.close();
   const other=await parent.getFileHandle('Other.orbit',{create:true});
   const otherWritable=await other.createWritable(); await otherWritable.write('other'); await otherWritable.close();
   await parent.getDirectoryHandle('New Map.orbit',{create:true});
   const sibling=await root.getDirectoryHandle(unique+'-sibling',{create:true});
   const siblingSource=await sibling.getFileHandle('Map.orbit',{create:true});
   const siblingWritable=await siblingSource.createWritable(); await siblingWritable.write('different'); await siblingWritable.close();
   const clone=await root.getDirectoryHandle(unique);
   const queries=[]; const lists=[]; const requests=[];
   const adapter={
     async queryReadPermission(directory){queries.push(directory.name);return {ok:true,permission:'granted'}},
     async requestReadPermission(){requests.push('request');return {ok:true,permission:'granted'}},
     async enumerateTopLevelMaps(directory){
       lists.push(directory.name); const entries=[];
       for await (const [name,handle] of directory.entries()) entries.push({name,handle,type:handle.kind,kind:handle.kind});
       return {ok:true,entries,truncated:false};
     }
   };
   const parentResult=await mod.resolveRenameParent({activeHandle:source,selectedDirectory:{handle:parent,name:unique},libraries:[{id:'lib-opfs',name:unique,handle:clone}],adapter});
   const current={datasetToken:'opfs-dataset',session:1,ownership:2,revision:3,handle:source,documentIdentity:'orbit:opfs',savedRevision:3};
   const captured={...current};
   const collision=mod.buildRenamePreflight({tree:{id:'root',name:'Map'},activeHandle:source,activeDocumentName:'Map.orbit',documentIdentity:'orbit:opfs',baseline:{handle:source,documentIdentity:'orbit:opfs',digest:'x',size:18},current,captured,parent:parentResult,proposedName:'New Map',backend:'opfs'});
   const success=mod.buildRenamePreflight({tree:{id:'root',name:'Map'},activeHandle:source,activeDocumentName:'Map.orbit',documentIdentity:'orbit:opfs',baseline:{handle:source,documentIdentity:'orbit:opfs',digest:'x',size:18},current,captured,parent:parentResult,proposedName:'Renamed',backend:'opfs'});
   const capability=mod.describeRenameCapability({fileHandle:source,parentHandle:parent,backend:'opfs'});
   const names=[]; for await (const [name] of parent.entries()) names.push(name);
   const sourceText=await (await source.getFile()).text();
   return {
     resolver:{ok:parentResult.ok,entry:parentResult.entry?.name,parentLibraryId:parentResult.parent?.libraryId,sources:parentResult.parent?.sources,candidates:parentResult.candidates?.length},
     collision:{ok:collision.ok,reason:collision.reason},
     success:{ok:success.ok,title:success.title,filename:success.filename,kind:success.kind,requiresConfirmation:success.requiresConfirmation,capability:success.capability},
     capability,
     queries,lists,requests,names,sourceText,siblingSameName:await source.isSameEntry(siblingSource),
     oldStillPresent:names.includes('Map.orbit'),decoyPresent:names.includes('New Map.orbit')
   };
 })()`);
 assert.equal(result.resolver.ok,true);
 assert.equal(result.resolver.entry,'Map.orbit');
 assert.equal(result.resolver.candidates,1);
 assert.deepEqual(result.resolver.sources.sort(),['library','selected']);
 assert.equal(result.collision.ok,false);
 assert.equal(result.collision.reason,'destination-collision');
 assert.equal(result.success.ok,true);
 assert.equal(result.success.filename,'Renamed.orbit');
 assert.equal(result.capability.directMoveVerified,false);
 assert.equal(result.capability.overwriteSemantics,'unverified');
 assert.equal(result.capability.copyPathAvailable,true);
 assert.deepEqual(result.requests,[]);
 assert.equal(result.queries.length,1);
 assert.equal(result.lists.length,1);
 assert.equal(result.oldStillPresent,true);
 assert.equal(result.decoyPresent,true);
 assert.equal(result.sourceText,'exact-orbit-bytes');
 assert.equal(result.siblingSameName,false);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({sha,result,errors},null,2));
} finally {try{ws?.close()}catch{}try{process.kill(browser.pid)}catch{}}
