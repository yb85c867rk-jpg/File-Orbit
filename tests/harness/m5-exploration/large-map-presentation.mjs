const SVG = 'http://www.w3.org/2000/svg';
export function createLargeMapPresentation({ container, getTree, getSelectedId, getDatasetToken, canInteract, onSelect, onPreview, onEdit, onFolderChange, onStatus }) {
  const root = document.createElement('div');
  root.dataset.largeMap = 'true';
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#020617';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
  root.appendChild(canvas);
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;top:8px;left:8px;right:8px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;z-index:2;pointer-events:none';
  const crumb = document.createElement('span'); crumb.style.cssText = 'pointer-events:auto;display:flex;gap:3px;align-items:center;flex-wrap:wrap;background:rgba(15,23,42,.92);border:1px solid #334155;border-radius:5px;padding:3px 5px;color:#cbd5e1;font:12px system-ui;max-width:55%';
  const button = (label, title, fn) => { const b=document.createElement('button'); b.textContent=label; b.title=title; b.style.cssText='pointer-events:auto;background:#172033;color:#e2e8f0;border:1px solid #475569;border-radius:5px;min-width:30px;height:28px;padding:2px 7px;font:13px system-ui;cursor:pointer'; b.addEventListener('click',fn); return b; };
  const back = button('←','Back',()=>backNav()); const home = button('⌂','Root',()=>rootNav()); const zin = button('+','Zoom in',()=>zoom(1.2)); const zout = button('−','Zoom out',()=>zoom(1/1.2));
  bar.append(back, home, zin, zout, crumb); root.appendChild(bar);
  container.appendChild(root);
  let transitionMs = 750;
  const state = { tree:null, positions:new Map(), focusId:null, selected:null, searchTarget:null, searchFolders:new Set(), forced:new Set(), history:[], cameras:new Map(), camera:{x:0,y:0,scale:1}, anim:null, drag:null, viewport:{width:1,height:1}, labels:[], activeLayout:null, signature:'', datasetToken:null, frameHandle:null, disposed:false };
  const $ = (s) => document.querySelector(s);
  function count(n){return 1+(n.children||[]).reduce((s,c)=>s+count(c),0)}
  function find(id,n=state.tree){if(!n)return null;if(n.id===id)return n;for(const c of n.children||[]){const f=find(id,c);if(f)return f}return null}
  function parentOf(id,n=state.tree,p=null){if(!n)return null;if(n.id===id)return p;for(const c of n.children||[]){const f=parentOf(id,c,n);if(f!==null)return f}return null}
  function pathTo(id){const out=[];let n=find(id);while(n){out.unshift(n);if(n.id===state.tree.id)break;n=parentOf(n.id)}return out}
  function isFolder(n){return n?.kind==='folder'}
  function descendants(n){const set=new Set();const walk=(x)=>{set.add(x.id);for(const c of x.children||[])walk(c)};walk(n);return set}
  function layoutAt(node,positions,origin={x:0,y:0},depth=0){positions.set(node.id,{x:origin.x,y:origin.y,depth,parentId:null});const place=(n,x,y,d,pid)=>{positions.set(n.id,{x,y,depth:d,parentId:pid});const children=n.children||[];if(!children.length)return;const base=children.length>12?300:160;let index=0;for(let ring=0;index<children.length;ring++){const radius=base+ring*95;const cap=Math.max(6,Math.floor((Math.PI*2*radius)/80));const take=Math.min(cap,children.length-index);for(let i=0;i<take;i++){const a=(Math.PI*2*i)/take-Math.PI/2;const c=children[index];place(c,x+Math.cos(a)*radius,y+Math.sin(a)*radius,d+1,n.id);index++}}};if(node!==state.tree) positions.delete(node.id);for(const c of node.children||[])place(c,origin.x,origin.y,depth+1,node.id);return positions}
  function buildPositions(){const p=new Map();const place=(n,x,y,d,pid)=>{p.set(n.id,{x,y,depth:d,parentId:pid});const children=n.children||[];if(!children.length)return;const base=children.length>12?300:160;let index=0;for(let ring=0;index<children.length;ring++){const radius=base+ring*95;const cap=Math.max(6,Math.floor((Math.PI*2*radius)/80));const take=Math.min(cap,children.length-index);for(let i=0;i<take;i++){const a=(Math.PI*2*i)/take-Math.PI/2;const c=children[index];place(c,x+Math.cos(a)*radius,y+Math.sin(a)*radius,d+1,n.id);index++}}};place(state.tree,0,0,0,null);return p}
  function localPositions(focus){const p=new Map();const origin=state.positions.get(focus.id)||{x:0,y:0};const place=(n,x,y,d,pid)=>{p.set(n.id,{x,y,depth:d,parentId:pid});const children=n.children||[];if(!children.length)return;const base=children.length>10?220:130;let index=0;for(let ring=0;index<children.length;ring++){const radius=base+ring*75;const cap=Math.max(6,Math.floor((Math.PI*2*radius)/80));const take=Math.min(cap,children.length-index);for(let i=0;i<take;i++){const a=(Math.PI*2*i)/take-Math.PI/2;const c=children[index];place(c,x+Math.cos(a)*radius,y+Math.sin(a)*radius,d+1,n.id);index++}}};place(focus,origin.x,origin.y,0,null);return p}
  function hasFolderRoot(){return (state.tree.children||[]).some(isFolder)}
  function baseScene(){const activeView=state.focusId!==state.tree.id;const activeIds=descendants(find(state.focusId)||state.tree);const bg=new Map();const add=(n)=>{const p=state.positions.get(n.id);if(p)bg.set(n.id,{...p,id:n.id,node:n,kind:n.kind,active:false,background:activeView})};const walk=(n)=>{for(const c of n.children||[]){if(state.tree.children.some(isFolder)||isFolder(c)||state.tree.children.every((x)=>!isFolder(x))) { if(isFolder(c)||!hasFolderRoot()) add(c); if(isFolder(c)) walk(c); }}};if(!hasFolderRoot()){for(const c of state.tree.children||[])add(c)}else{walk(state.tree)}const rootPos=state.positions.get(state.tree.id);const nodes=rootPos?[{...rootPos,id:state.tree.id,node:state.tree,kind:'folder',active:false,background:activeView},...bg.values()]:[...bg.values()];if(activeView){const local=state.activeLayout||(state.activeLayout=localPositions(find(state.focusId)));for(const id of activeIds){const n=find(id);if(!n)continue;const lp=local.get(id);if(!lp)continue;if(n.id===state.tree.id)continue;if(!bg.has(id)&&!isFolder(n))nodes.push({...lp,id:n.id,node:n,kind:n.kind,active:true,background:false});else {const entry=bg.get(id);if(entry){entry.x=lp.x;entry.y=lp.y;entry.depth=lp.depth;entry.active=true;entry.background=false}}}}for(const id of state.forced){const n=find(id);if(!n||nodes.some((e)=>e.node.id===id))continue;const p=state.positions.get(id)||{x:120,y:0};nodes.push({...p,id:n.id,node:n,kind:n.kind,active:true,background:false,forced:true})}return nodes}
  function scene(){return state.geom ? geomScene(state.geom) : baseScene()}
  function bounds(nodes){const xs=nodes.map((n)=>n.x),ys=nodes.map((n)=>n.y);return{minX:Math.min(...xs)-60,maxX:Math.max(...xs)+60,minY:Math.min(...ys)-60,maxY:Math.max(...ys)+60}}
  function fitCamera(nodes){const b=bounds(nodes.length?nodes:[{x:0,y:0}]);const s=Math.max(0.08,Math.min(2.2,Math.min(state.viewport.width/(b.maxX-b.minX),state.viewport.height/(b.maxY-b.minY))*0.9));return{x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,scale:s}}
  function overviewCamera(nodes=baseScene()){return cameraForBounds(nodes.filter((n)=>n.background||!n.active))}
  function durationMs(){const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;return reduced?120:Math.max(0,Number(transitionMs)||0)}
  function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function usableViewport(){const w=state.viewport.width,h=state.viewport.height;let left=0,right=0,top=0,bottom=0;const rr=root.getBoundingClientRect();for(const sel of ['#nav-rail','#details-panel','#graph-action-toolbar']){const el=document.querySelector(sel);if(!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const overlapX=Math.max(0,Math.min(rr.right,r.right)-Math.max(rr.left,r.left));const overlapY=Math.max(0,Math.min(rr.bottom,r.bottom)-Math.max(rr.top,r.top));if(!overlapX||!overlapY)continue;if(r.left<rr.left+1)left=Math.max(left,overlapX);else if(r.right>rr.right-1)right=Math.max(right,overlapX);if(r.top<rr.top+1)top=Math.max(top,overlapY);else if(r.bottom>rr.bottom-1)bottom=Math.max(bottom,overlapY)}const pad=24;left+=pad;right+=pad;top+=pad;bottom+=pad;const cw=Math.max(1,w-left-right),ch=Math.max(1,h-top-bottom);return{left,right,top,bottom,width:cw,height:ch,cx:left+cw/2,cy:top+ch/2}}
  function cameraForNodes(nodes){const active=nodes.filter((n)=>n.active||n.forced);if(!active.length)return cameraForBounds(nodes);return cameraForBounds(active,1)}
  function cameraForBounds(nodes,fillFactor=0.86){if(!nodes.length)return{x:0,y:0,scale:1};const b=bounds(nodes);const vp=usableViewport();const s=Math.max(0.08,Math.min(2.4,Math.min(vp.width/(b.maxX-b.minX),vp.height/(b.maxY-b.minY))*fillFactor));const cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;return{x:cx-(vp.cx-state.viewport.width/2)/s,y:cy-(vp.cy-state.viewport.height/2)/s,scale:s}}
  function activeCamera(){return cameraForNodes(baseScene())}
  function navigateTo(id){const node=find(id);if(!node)return;if(id===state.tree.id)rootNav();else activate(node,{});}
  function screen(n){const cam=n.background?overviewCamera():state.camera;return{x:state.viewport.width/2+(n.x-cam.x)*cam.scale,y:state.viewport.height/2+(n.y-cam.y)*cam.scale}}
  function animate(to,duration=durationMs()){state.anim={from:{...state.camera},to,start:performance.now(),duration:Math.max(0,duration)}}
  function freezeGeometry(){if(!state.geom||state.geom.frozen!=null)return;const p=Math.min(1,(performance.now()-state.geom.start)/Math.max(1,state.geom.duration));state.geom.frozen=p}
  function cancel(){freezeGeometry();state.anim=null}
  function beginGeometry(targetNodes,clickedId,sourceNodes){const fromNodes=sourceNodes||scene();const from=new Map(fromNodes.map((n)=>[n.id,{...n}]));const ranks=new Map(targetNodes.map((n,i)=>[n.id,i]));const clicked=clickedId?from.get(clickedId):null;const spawn=clicked?{x:clicked.x,y:clicked.y}:{x:state.camera.x,y:state.camera.y};const duration=durationMs();state.geom={from,to:targetNodes,start:performance.now(),duration,clickedId,spawn,ranks,fromNodes}}
  function transitionTo(source,target,clickedId,cameraOverride){beginGeometry(target,clickedId,source);animate(cameraOverride||cameraForNodes(target),state.geom.duration);render()}
  function geomScene(g){const p=g.frozen!=null?g.frozen:Math.min(1,(performance.now()-g.start)/Math.max(1,g.duration));const e=ease(p);const out=[];for(const n of g.to){const f=g.from.get(n.id);let x=n.x,y=n.y,opacity=1;if(f){x=f.x+(n.x-f.x)*e;y=f.y+(n.y-f.y)*e}else{const rank=g.ranks.get(n.id)||0;const delay=0.05+Math.min(0.32,(rank/Math.max(1,g.ranks.size))*0.32);const q=Math.min(1,Math.max(0,(p-delay)/(1-delay)));const qe=ease(q);x=g.spawn.x+(n.x-g.spawn.x)*qe;y=g.spawn.y+(n.y-g.spawn.y)*qe;opacity=q}out.push({...n,x,y,opacity})}for(const n of g.fromNodes){if(g.ranks.has(n.id))continue;out.push({...n,opacity:1-e,background:true,active:false})}return out}
  function topologyHash(node) { return [node.id, node.kind, (node.children || []).map(topologyHash).join(',')].join('(') + ')'; }
  function refresh(selectedId, searchState = {}) {
    const tree = getTree(); if (!tree) return;
    if (root.clientWidth > 0 && root.clientHeight > 0) state.viewport = { width: root.clientWidth, height: root.clientHeight };
    const dataset = getDatasetToken?.() ?? null;
    const replacement = state.datasetToken !== dataset;
    if (replacement) { cancel(); state.drag = null; state.anim = null; state.geom = null; state.datasetToken = dataset; state.focusId = tree.id; state.selected = null; state.searchTarget = null; state.searchFolders = new Set(); state.forced.clear(); state.history = []; state.cameras.clear(); state.activeLayout = null; state.camera = { x: 0, y: 0, scale: 1 }; }
    state.tree = tree;
    if (selectedId !== undefined) state.selected = selectedId;
    state.searchTarget = searchState.searchTargetId || null;
    state.searchFolders = new Set(searchState.searchFolderIds || []);
    if (!state.searchTarget) state.forced.clear();
    const sig = tree.id + ':' + count(tree) + ':' + topologyHash(tree);
    if (!state.positions.size || replacement || sig !== state.signature) {
      if (sig !== state.signature) { cancel(); state.geom=null; state.drag = null; }
      state.positions = buildPositions(); state.activeLayout = null; state.signature = sig;
      if (!find(state.focusId)) state.focusId = tree.id;
      if (replacement || !state.cameras.has(state.focusId)) state.camera = overviewCamera();
    }
    if (state.searchTarget && state.forced.size === 0) { const target = find(state.searchTarget); if (target) state.forced.add(target.id); }
    render(); onFolderChange?.(pathTo(state.focusId), state.focusId);
  }
  function render(){if(!state.tree)return;const w=root.clientWidth,h=root.clientHeight;if(w<=0||h<=0)return;state.viewport={width:w,height:h};const dpr=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#020617';ctx.fillRect(0,0,w,h);const nodes=scene();const byId=new Map(nodes.map((n)=>[n.id,n]));for(const n of nodes){if(!n.parentId||!byId.has(n.parentId))continue;const p=screen(n),c=screen(byId.get(n.parentId));const searchEdge=state.searchFolders.has(n.id)&&n.parentId&&state.searchFolders.has(n.parentId);ctx.strokeStyle=searchEdge?'#60A5FA':'#454B54';ctx.globalAlpha=(Math.min(n.opacity??1,byId.get(n.parentId)?.opacity??1))*0.55;ctx.lineWidth=searchEdge?2:1;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(p.x,p.y);ctx.stroke()}ctx.globalAlpha=1;for(const n of nodes){const p=screen(n);const r=Math.max(n.kind==='folder'?5:3,Math.min(22,n.kind==='folder'?12:7)*state.camera.scale);const isPdf=n.kind==='file'&&n.node.name.toLowerCase().endsWith('.pdf');let fill=n.kind==='folder'?'#B8BEC7':'#22C55E';if(isPdf)fill='#F87171';ctx.globalAlpha=(n.background?0.22:1)*(n.opacity??1);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();let stroke=n.kind==='folder'?'#D1D5DB':'#22C55E',strokeWidth=1;if(n.kind==='folder'&&state.searchFolders.has(n.id)){stroke='#60A5FA';strokeWidth=2.5}if(n.id===state.selected||n.id===state.geom?.clickedId){stroke='#f59e0b';strokeWidth=3}if(n.id===state.searchTarget){stroke='#60A5FA';strokeWidth=4}ctx.strokeStyle=stroke;ctx.lineWidth=strokeWidth;ctx.stroke();ctx.globalAlpha=1;const labelColor=n.background?'#94a3b8':(isPdf?'#F87171':'#f8fafc');state.paint=state.paint||new Map();state.paint.set(n.id,{fill,stroke,strokeWidth,labelColor});const label=n.id===state.selected||n.id===state.geom?.clickedId||n.id===state.searchTarget||(n.kind==='folder'&&(!n.background||n.id===state.geom?.clickedId))||(n.background&&n.kind==='folder')||(n.active&&state.camera.scale>1.15);if(label){ctx.globalAlpha=(n.background?0.42:1)*(n.opacity??1);ctx.font=(n.kind==='folder'?'600 ':'')+'11px system-ui';ctx.textAlign='center';ctx.fillStyle=labelColor;ctx.fillText(n.node.name.length>22?n.node.name.slice(0,20)+'…':n.node.name,p.x,p.y+r+13)}if(isPdf){ctx.fillStyle='#F87171';ctx.font='bold 8px system-ui';ctx.fillText('PDF',p.x,p.y+3)}ctx.globalAlpha=1}state.labels=[];const cats=nodes.filter((n)=>n.kind==='folder'&&((n.id===state.geom?.clickedId)||(!state.geom&&state.focusId===state.tree.id&&n.depth===1)));if(cats.length<=30&&(state.camera.scale<0.6||state.geom?.clickedId)){const cx=w/2,cy=h/2,rx=Math.min(w/2-140,360),ry=Math.min(h/2-60,230);cats.forEach((n,i)=>{const a=-Math.PI/2+Math.PI*2*i/cats.length,lx=cx+Math.cos(a)*rx,ly=cy+Math.sin(a)*ry,p=screen(n);ctx.strokeStyle='#64748b';ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(lx,ly);ctx.stroke();ctx.globalAlpha=1;const parts=n.node.name.includes('_')?n.node.name.split('_'):[n.node.name];ctx.font='600 11px system-ui';ctx.textAlign='center';const width=Math.max(...parts.map((t)=>ctx.measureText(t).width))+10;ctx.fillStyle='#0f172a';ctx.fillRect(lx-width/2,ly-12,width,parts.length*13+6);ctx.fillStyle='#f8fafc';parts.forEach((t,j)=>ctx.fillText(t,lx,ly+j*13+1));state.labels.push({id:n.id,x:lx-width/2,y:ly-12,w:width,h:parts.length*13+6,opacity:n.opacity??1})})}crumb.replaceChildren(...pathTo(state.focusId).map((n)=>{const b=document.createElement('button');b.textContent=n.name;b.style.cssText='pointer-events:auto;background:transparent;border:0;color:#cbd5e1;font:12px system-ui;cursor:pointer;padding:1px 3px';b.addEventListener('click',()=>{if(n.id===state.tree.id)rootNav();else navigateTo(n.id)});return b}));onFolderChange?.(pathTo(state.focusId),state.focusId)}
  function hit(event){const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;const nodes=scene();for(const l of state.labels){if((l.opacity??1)<0.45)continue;if(x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h){const canonical=nodes.find((n)=>n.id===l.id);if(canonical)return canonical;const node=find(l.id);return node?{id:node.id,node,kind:node.kind}:null}}for(const layer of [true,false]){let best=null;for(const n of nodes){if(Boolean(n.active||n.forced)!==layer)continue;const p=screen(n),rad=Math.max(8,Math.min(22,n.kind==='folder'?12:7)*state.camera.scale)+8,d=Math.hypot(x-p.x,y-p.y);if(d<=rad&&(!best||d<best.d))best={n,d}}if(best)return best.n}return null}
  function selectNode(id,open=false){if(canInteract&&!canInteract(id,find(id)?.kind||'file'))return;state.selected=id;onSelect?.(id);if(open)onPreview?.(id);render()}
  function activate(n,event){if(!n)return;if(canInteract&&!canInteract(n.id,n.kind))return;if(n.kind==='folder'){const source=scene();onSelect?.(null);state.history.push({focusId:state.focusId,selected:state.selected,camera:{...state.camera}});state.cameras.set(state.focusId,{...state.camera});state.focusId=n.id;state.selected=null;state.forced.clear();state.activeLayout=null;const target=baseScene();transitionTo(source,target,n.id,cameraForNodes(target))}else selectNode(n.id,false)}
  function backNav(){if(canInteract&&!canInteract(state.focusId,'folder'))return;const p=state.history.pop();if(!p)return;const source=scene();state.focusId=p.focusId;state.selected=p.selected;onSelect?.(p.selected);state.forced.clear();state.activeLayout=null;const target=baseScene();transitionTo(source,target,p.focusId,p.camera||cameraForNodes(target))}
  function rootNav(){if(canInteract&&!canInteract(state.focusId,'folder'))return;const source=scene();state.focusId=state.tree.id;state.selected=null;onSelect?.(null);state.forced.clear();state.activeLayout=null;state.history=[];const target=baseScene();transitionTo(source,target,state.focusId,overviewCamera(target))}
  function reveal(id){const n=find(id);if(!n)return false;if(n.kind==='folder'){const source=scene();onSelect?.(id);state.history.push({focusId:state.focusId,selected:state.selected,camera:{...state.camera}});state.cameras.set(state.focusId,{...state.camera});state.focusId=id;state.selected=id;state.searchTarget=id;state.forced.clear();state.activeLayout=null;const target=baseScene();transitionTo(source,target,id,cameraForNodes(target));return true}const p=parentOf(id);if(!p)return false;const source=scene();state.history.push({focusId:state.focusId,selected:state.selected,camera:{...state.camera}});state.cameras.set(state.focusId,{...state.camera});state.focusId=p.id;state.selected=id;state.searchTarget=id;state.forced.clear();if(p.id===state.tree.id)state.forced.add(id);state.activeLayout=null;const target=baseScene();transitionTo(source,target,id,p.id===state.tree.id?overviewCamera(target):cameraForNodes(target));return true}
  function zoom(f){if(canInteract&&!canInteract(state.focusId,'folder'))return;cancel();state.camera={...state.camera,scale:Math.max(0.08,Math.min(4,state.camera.scale*f))};render()}
  function fitView(){if(canInteract&&!canInteract(state.focusId,'folder'))return;cancel();state.camera=overviewCamera();render()}
  canvas.addEventListener('wheel',(e)=>{if(canInteract&&!canInteract(state.focusId,'folder'))return;e.preventDefault();cancel();const r=canvas.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,before={x:state.camera.x+(px-state.viewport.width/2)/state.camera.scale,y:state.camera.y+(py-state.viewport.height/2)/state.camera.scale},s=Math.max(0.08,Math.min(4,state.camera.scale*(e.deltaY<0?1.12:1/1.12)));state.camera={scale:s,x:before.x-(px-state.viewport.width/2)/s,y:before.y-(py-state.viewport.height/2)/s};render()},{passive:false});
  canvas.addEventListener('pointerdown',(e)=>{if(e.button!==0)return;if(canInteract&&!canInteract(state.focusId,'folder'))return;cancel();state.drag={x:e.clientX,y:e.clientY,camera:{...state.camera},moved:false};canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',(e)=>{if(!state.drag)return;const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;if(Math.abs(dx)+Math.abs(dy)>4)state.drag.moved=true;state.camera={...state.drag.camera,x:state.drag.camera.x-dx/state.camera.scale,y:state.drag.camera.y-dy/state.camera.scale};render()});
  canvas.addEventListener('pointerup',()=>{if(!state.drag)return;state.suppress=state.drag.moved;state.drag=null});
  canvas.addEventListener('click',(e)=>{if(state.suppress){state.suppress=false;return}const n=hit(e);if(n)activate(n,e)});
  canvas.addEventListener('dblclick',(e)=>{const n=hit(e);if(n&&n.kind==='file'){e.preventDefault();selectNode(n.id,true)}});
  canvas.addEventListener('contextmenu',(e)=>{const n=hit(e);if(n){e.preventDefault();if(canInteract&&!canInteract(n.id,n.kind))return;state.selected=n.id;onSelect?.(n.id);onEdit?.(n.id,e);render()}});
  function stepTransition(t){if(!state.anim)return;const p=Math.min(1,(t-state.anim.start)/Math.max(1,state.anim.duration)),e=ease(p);state.camera={x:state.anim.from.x+(state.anim.to.x-state.anim.from.x)*e,y:state.anim.from.y+(state.anim.to.y-state.anim.from.y)*e,scale:state.anim.from.scale+(state.anim.to.scale-state.anim.from.scale)*e};if(p>=1){state.camera={...state.anim.to};state.geom=null;render();state.cameras.set(state.focusId,{...state.camera});state.anim=null}else render()}
  function tick(t){if(state.disposed)return;stepTransition(t);state.frameHandle=requestAnimationFrame(tick)}state.frameHandle=requestAnimationFrame(tick);
  const ro=new ResizeObserver(()=>render());ro.observe(root);
  return { refresh, reveal, render, screenOf:(n)=>screen(n), fit:fitView, paint:()=>({ paint: state.paint || new Map(), searchTarget: state.searchTarget, searchFolders: [...state.searchFolders] }), sampleNode:(id)=>{const n=scene().find((x)=>x.id===id);if(!n)return null;const p=screen(n),dpr=Math.max(1,window.devicePixelRatio||1);return [...canvas.getContext('2d').getImageData(Math.floor(p.x*dpr),Math.floor(p.y*dpr),1,1).data]}, lifecycle:()=>({ disposed:state.disposed, frameHandle:state.frameHandle, anim:Boolean(state.anim), geom:Boolean(state.geom), animDuration:state.anim?.duration??null, drag:Boolean(state.drag) }), isActive:()=>Boolean(state.tree), destroy(){state.disposed=true;if(state.frameHandle!==null)cancelAnimationFrame(state.frameHandle);state.frameHandle=null;state.anim=null;state.geom=null;state.drag=null;ro.disconnect();root.remove();state.tree=null;state.positions.clear();state.labels=[];state.history=[]},  stepTransitionForTest(elapsed){if(state.anim)state.anim.start=performance.now()-Math.max(0,Number(elapsed)||0);if(state.geom)state.geom.start=performance.now()-Math.max(0,Number(elapsed)||0);stepTransition(performance.now());return {camera:{...state.camera},anim:Boolean(state.anim),geom:Boolean(state.geom)}}, setTransitionDuration(ms){transitionMs=Math.max(0,Number(ms)||0);return transitionMs}, transitionDuration(){return durationMs()}, scene, get focusId(){return state.focusId}, get selected(){return state.selected}, get camera(){return{...state.camera}}, navigateTo(id){const n=find(id);if(n)activate(n,{})}, _state:state };
}






























