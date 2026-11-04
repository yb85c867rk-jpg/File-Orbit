import { buildFixture } from '../stage2a/fixtures.mjs';
import { LodPresentationModel, validateClusterSize } from '../../src/engine/hypertree/lod/presentation-model.js';
import { createLodRenderAdapter } from '../../src/engine/hypertree/lod/render-adapter.js';

const state = { shape: 'mixed', total: 1000, clusterSize: 40, model: null, adapter: null, search: null };
const root = document.getElementById('app');
root.innerHTML = `
  <header class="top"><div><h1>FileOrbit · Stage 2B-2 LOD + renderer harness</h1><p class="subtle">분석용 LOD 데모 · 문서는 수정되지 않습니다.</p></div>
  <div class="fixture-controls"><label>Fixture <select id="shape">${['flat','wide','balanced','mixed','deep'].map((s)=>`<option ${s==='mixed'?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Nodes <select id="total"><option>300</option><option selected>1000</option></select></label><button id="load">Load fixture</button></div></header>
  <section class="bar"><nav id="crumbs" aria-label="Breadcrumb"></nav><div class="actions"><button id="back">뒤로</button><button id="overview">개요</button></div></section>
  <section class="search"><input id="query" type="search" placeholder="전체 문서 검색: 이름, ID, 경로" aria-label="Search complete document"><button id="search-button">검색</button><span id="search-summary" class="subtle"></span><div class="pager"><button id="prev-page" disabled>이전 50</button><button id="next-page" disabled>다음 50</button></div></section>
  <main><section class="graph-panel"><div id="canvas-host" class="canvas-host"></div><div id="scene-summary" class="subtle"></div></section><aside id="details" class="details"><p class="subtle">노드나 묶음을 선택하세요.</p></aside></main>
  <section id="search-results" class="results" aria-live="polite"></section>`;
const shapeEl = document.getElementById('shape'); const totalEl = document.getElementById('total');
const host = document.getElementById('canvas-host'); const details = document.getElementById('details');
const crumbs = document.getElementById('crumbs'); const results = document.getElementById('search-results');
const summary = document.getElementById('scene-summary'); const searchSummary = document.getElementById('search-summary');
state.adapter = createLodRenderAdapter({ host, width: 1200, height: 700, dpr: window.devicePixelRatio || 1 });
function model() { return state.model; }
function draw() {
  const rendered = state.adapter.render(model());
  summary.textContent = `${rendered.mode} · nodes ${rendered.nodeCount} · edges ${rendered.edgeCount} · labels ${rendered.labelCount} · proxies ${rendered.proxyCount} · cluster size ${state.clusterSize}`;
  renderCrumbs(); renderDetails(); updatePager();
}
function renderCrumbs() {
  crumbs.replaceChildren();
  for (const [index, crumb] of model().breadcrumb().entries()) {
    if (index) crumbs.append(document.createTextNode(' / '));
    const button = document.createElement('button'); button.className = 'crumb'; button.textContent = crumb.name;
    button.addEventListener('click', () => { if (!crumb.proxy) { model().navigateToFolder(crumb.id); draw(); } });
    crumbs.append(button);
  }
}
function renderDetails() {
  const d = model().details(); details.replaceChildren();
  if (!d) { const p = document.createElement('p'); p.className = 'subtle'; p.textContent = '노드나 묶음을 선택하세요.'; details.append(p); return; }
  const h = document.createElement('h2'); h.textContent = d.name; details.append(h);
  const lines = d.proxy ? ['시각적 묶음 · 실제 폴더가 아닙니다.', `${d.count}개 구성원 · 파일 미리보기와 편집을 제공하지 않습니다.`, `proxy ID: ${d.id}`] : [d.nodeKind === 'folder' ? '폴더' : '파일', d.path, `ID: ${d.id}`, d.attachmentId ? '첨부 참조가 있는 데이터 노드입니다.' : null].filter(Boolean);
  for (const line of lines) { const p = document.createElement('p'); p.textContent = line; details.append(p); }
  if (d.proxy) { const b = document.createElement('button'); b.textContent = '이 묶음 펼치기'; b.addEventListener('click', () => { model().expandCluster(d.id); draw(); }); details.append(b); }
  else if (d.nodeKind === 'folder') { const b = document.createElement('button'); b.textContent = '폴더 열기'; b.addEventListener('click', () => { model().enterFolder(d.id); draw(); }); details.append(b); }
}
function updatePager() {
  const s = model().state; const prev = document.getElementById('prev-page'); const next = document.getElementById('next-page');
  prev.disabled = !s.query || s.searchPage <= 1; next.disabled = !s.query || s.searchPage >= s.searchPages;
  searchSummary.textContent = s.query ? `“${s.query}” · ${s.searchTotal}개 · ${s.searchPage}/${s.searchPages || 1} 페이지` : '';
}
function runSearch(page = 1) {
  state.search = model().search(document.getElementById('query').value, page);
  renderResults(); updatePager(); draw();
}
function renderResults() {
  results.replaceChildren();
  if (!state.search) return;
  if (!state.search.total) { const p = document.createElement('p'); p.className = 'subtle'; p.textContent = '일치하는 노드가 없습니다.'; results.append(p); return; }
  const h = document.createElement('h2'); h.textContent = `검색 결과 ${state.search.total}개 · ${state.search.page}/${state.search.pages} 페이지`; results.append(h);
  for (const item of state.search.results) {
    const b = document.createElement('button'); b.className = 'result'; b.dataset.id = item.id; b.textContent = `${item.name} · ${item.kind} · ${item.path} · ${item.id}`;
    b.addEventListener('click', () => { model().revealSearchResult(item.id); draw(); }); results.append(b);
  }
  const p = document.createElement('p'); p.className = 'subtle'; p.textContent = `이 페이지 ${state.search.results.length}개 · 전체 ${state.search.total}개를 페이지로 모두 탐색할 수 있습니다.`; results.append(p);
}
host.addEventListener('click', (event) => {
  const rect = host.getBoundingClientRect(); const id = state.adapter.labelAtPoint(event.clientX, event.clientY) ?? state.adapter.hitTest(event.clientX - rect.left, event.clientY - rect.top);
  if (!id) return;
  if (model().isProxy(id)) model().expandCluster(id); else model().select(id);
  draw();
});
host.addEventListener('dblclick', (event) => {
  const rect = host.getBoundingClientRect(); const id = state.adapter.hitTest(event.clientX - rect.left, event.clientY - rect.top);
  if (!id || model().isProxy(id)) return;
  const record = model().documentRecord(id); if (record?.node.kind === 'folder') { model().enterFolder(id); draw(); }
});
document.getElementById('back').addEventListener('click', () => { model().back(); draw(); });
document.getElementById('overview').addEventListener('click', () => { model().overview(); draw(); });
document.getElementById('search-button').addEventListener('click', () => runSearch(1));
document.getElementById('query').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(1); });
document.getElementById('prev-page').addEventListener('click', () => runSearch(Math.max(1, model().state.searchPage - 1)));
document.getElementById('next-page').addEventListener('click', () => runSearch(Math.min(model().state.searchPages, model().state.searchPage + 1)));
document.getElementById('load').addEventListener('click', () => loadFixture(shapeEl.value, Number(totalEl.value)));

function loadFixture(shape, total) {
  state.shape = shape; state.total = total; shapeEl.value = shape; totalEl.value = String(total);
  state.model = new LodPresentationModel(buildFixture(shape, total), { clusterSize: state.clusterSize });
  state.search = null; document.getElementById('query').value = ''; results.replaceChildren(); draw();
}
function domState() {
  return { canvases: host.querySelectorAll('canvas').length, labelOverlays: host.querySelectorAll('[data-vd-labels]').length, labelGroups: host.querySelectorAll('[data-vd-label-id]').length };
}
function remount(iterations = 1) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 50) throw new RangeError('remount iterations must be 1..50');
  const afterDispose = [];
  for (let index = 0; index < iterations; index += 1) {
    state.adapter.dispose();
    afterDispose.push(domState());
    host.replaceChildren();
    state.adapter = createLodRenderAdapter({ host, width: 1200, height: 700, dpr: window.devicePixelRatio || 1 });
    draw();
  }
  return { iterations, afterDispose, final: domState() };
}
const api = {
  loadFixture(shape, total, clusterSize = 40) { state.clusterSize = validateClusterSize(clusterSize); loadFixture(shape, total); return api.stats(); },
  stats() { const c = state.adapter.current; return { shape: state.shape, total: state.total, mode: c?.scene ? c.model.buildScene().mode : null, sceneNodes: c?.scene?.nodes.size ?? 0, edges: c?.scene?.edges.length ?? 0, labels: c?.metrics?.visibleCount ?? 0, proxies: c ? [...c.scene.nodes.keys()].filter((id) => model().isProxy(id)).length : 0, labelMetrics: c?.metrics ? { priorityVisibleCount: c.metrics.priorityVisibleCount, prioritySuppressedCount: c.metrics.prioritySuppressedCount, overlapSuppressedCount: c.metrics.overlapSuppressedCount, selectedLabelVisible: c.metrics.selectedLabelVisible } : null, ...model().context() }; },
  state() { return { ...model().context(), query: model().state.query, mode: model().buildScene().mode, shape: state.shape, total: state.total, clusterSize: state.clusterSize }; },
  centerOf(id) { const c = state.adapter.current; const node = c?.scene?.nodes?.get(id); if (!node) return null; const rect = host.getBoundingClientRect(); return { x: rect.left + node.center.x, y: rect.top + node.center.y, layoutX: node.center.x, layoutY: node.center.y }; },
  hitTest(x, y) { return state.adapter.hitTest(x, y); },
  select(id) { const d = model().select(id); draw(); return d; },
  enterFolder(id) { model().enterFolder(id); draw(); return api.stats(); },
  expandCluster(id) { model().expandCluster(id); draw(); return api.stats(); },
  back() { model().back(); draw(); return api.stats(); },
  overview() { model().overview(); draw(); return api.stats(); },
  reveal(id) { model().revealNode(id); draw(); return api.stats(); },
  search(query, page = 1) { state.search = model().search(query, page); renderResults(); updatePager(); draw(); return state.search; },
  revealSearchResult(id) { model().revealSearchResult(id); draw(); return api.stats(); },
  documentIds() { return model().documentIdsList(); },
  documentInfo(id) { const record = model().documentRecord(id); return record ? { id, name: record.node.name, kind: record.node.kind, path: record.path.join(' / ') } : null; },
  deepestId() { let best = null; for (const [id, record] of model().index) if (!best || record.depth > model().index.get(best).depth) best = id; return best; },
  visibleIds() { return [...(state.adapter.current?.scene?.nodes?.keys() ?? [])]; },
  labelStats() { return state.adapter.labelStats(); },
  labelCenter(id) { const group = state.adapter.labels.getMetrics().labels.get(id); if (!group) return null; const rect = group.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; },
  sourceSnapshot() { return JSON.stringify(model().root); },
  remount,
  cleanupState() { return { canvases: host.querySelectorAll('canvas').length, labelOverlays: host.querySelectorAll('[data-vd-labels]').length, labelGroups: host.querySelectorAll('[data-vd-label-id]').length }; },
  revealAll() { const start = performance.now(); const ids = model().documentIdsList(); let failures = 0; for (const id of ids) { model().revealNode(id); if (model().state.selectedId !== id) failures += 1; const scene = model().buildScene(); if (!scene.items.some((item) => item.id === id) && scene.folder.id !== id) failures += 1; } draw(); return { count: ids.length, failures, ms: performance.now() - start }; }
};
window.stage2b2 = api;
loadFixture('mixed', 1000);



