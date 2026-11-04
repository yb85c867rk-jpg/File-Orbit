import { buildFixture, measureTree } from '../stage2a/fixtures.mjs';
import { LodPresentationModel, validateClusterSize } from '../../src/engine/hypertree/lod/presentation-model.js';
import { layoutScene, hitTestLayout, LAYOUT_WIDTH, LAYOUT_HEIGHT } from './layout.mjs';

const state = { shape: 'mixed', total: 1000, clusterSize: 40, model: null, layout: null, search: null };
const root = document.getElementById('app');
root.innerHTML = `
  <header class="top">
    <div><h1>FileOrbit · Stage 2B-1 cluster/focus prototype</h1><p class="subtle">분석용 LOD 데모 · 문서는 수정되지 않습니다.</p></div>
    <div class="fixture-controls">
      <label>Fixture <select id="shape">${['flat','wide','balanced','mixed','deep'].map((s)=>`<option ${s==='mixed'?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Nodes <select id="total"><option>300</option><option selected>1000</option></select></label>
      <button id="load">Load fixture</button>
    </div>
  </header>
  <section class="bar">
    <nav id="crumbs" aria-label="Breadcrumb"></nav>
    <div class="actions"><button id="back">뒤로</button><button id="overview">개요</button></div>
  </section>
  <section class="search">
    <input id="query" type="search" placeholder="전체 문서 검색: 이름, ID, 경로" aria-label="Search complete document">
    <button id="search-button">검색</button>
    <span id="search-summary" class="subtle"></span>
    <div class="pager"><button id="prev-page" disabled>이전 50</button><button id="next-page" disabled>다음 50</button></div>
  </section>
  <main>
    <section class="graph-panel">
      <svg id="graph" viewBox="0 0 ${LAYOUT_WIDTH} ${LAYOUT_HEIGHT}" role="img" aria-label="Cluster/focus graph"></svg>
      <div id="scene-summary" class="subtle"></div>
    </section>
    <aside id="details" class="details"><p class="subtle">노드나 묶음을 선택하세요.</p></aside>
  </main>
  <section id="search-results" class="results" aria-live="polite"></section>
`;

const shapeEl = document.getElementById('shape');
const totalEl = document.getElementById('total');
const graph = document.getElementById('graph');
const details = document.getElementById('details');
const crumbs = document.getElementById('crumbs');
const results = document.getElementById('search-results');
const summary = document.getElementById('scene-summary');
const searchSummary = document.getElementById('search-summary');

function currentModel() { return state.model; }
function nodeClass(node) {
  const selected = currentModel().state.selectedId === node.id;
  const target = currentModel().state.searchTargetId === node.id;
  return ['node', node.proxy ? 'proxy' : node.kind, node.badge === 'PDF' ? 'pdf' : '', selected ? 'selected' : '', target ? 'search-target' : ''].filter(Boolean).join(' ');
}
function draw() {
  const model = currentModel();
  const scene = model.buildScene();
  const priorityIds = [model.state.selectedId, model.state.searchTargetId].filter(Boolean);
  const layout = layoutScene(scene, { priorityIds });
  state.layout = layout;
  graph.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}, text = null) => { const el = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v)); if (text !== null) el.textContent = text; return el; };
  const center = layout.centerNode;
  graph.append(make('circle', { cx: center.x, cy: center.y, r: 34, class: 'current-folder-ring' }));
  const orderedNodes = [...layout.nodes].sort((a, b) => Number(a.priority) - Number(b.priority));
  for (const node of orderedNodes) {
    const g = make('g', { class: nodeClass(node), 'data-node-id': node.id, tabindex: 0, role: 'button' });
    g.append(make('circle', { cx: node.x, cy: node.y, r: node.radius, class: 'glyph' }));
    if (node.showLabel) {
      const label = node.priority && node.name.length > 48 ? `${node.name.slice(0,47)}…` : node.name.length > 32 ? `${node.name.slice(0,31)}…` : node.name;
      if (node.proxy) g.append(make('text', { x: node.labelX, y: node.labelY - 5, class: 'label proxy-label', 'text-anchor': node.labelAnchor }, label));
      else g.append(make('text', { x: node.labelX, y: node.labelY - 4, class: node.priority ? 'label priority-label' : 'label', 'text-anchor': node.labelAnchor }, label));
    }
    if (!node.proxy) g.append(make('text', { x: node.labelX, y: node.labelY + 12, class: node.badge === 'PDF' ? 'badge pdf-badge' : 'badge', 'text-anchor': node.labelAnchor }, node.badge));
    g.addEventListener('click', () => {
      if (node.proxy) model.expandCluster(node.id);
      else model.select(node.id);
      draw();
    });
    g.addEventListener('dblclick', () => {
      if (!node.proxy && node.kind === 'folder') model.enterFolder(node.id);
      draw();
    });
    graph.append(g);
  }
  const centerGroup = make('g', { class: 'node current', 'data-node-id': center.id });
  centerGroup.append(make('circle', { cx: center.x, cy: center.y, r: center.radius, class: 'glyph' }));
  centerGroup.append(make('text', { x: center.labelX, y: center.labelY - 4, class: 'label current-label' }, center.name));
  centerGroup.append(make('text', { x: center.labelX, y: center.labelY + 12, class: 'badge' }, '현재 폴더'));
  centerGroup.addEventListener('click', () => { model.select(center.id); draw(); });
  graph.append(centerGroup);
  const labelCount = 1 + layout.nodes.filter((node) => node.showLabel).length;
  summary.textContent = `${scene.mode} · scene nodes ${layout.all.length} · labels ${labelCount} · proxies ${layout.nodes.filter((n) => n.proxy).length} · cluster size ${state.clusterSize} · ${layout.ringCount} ring(s)`;
  renderCrumbs(scene);
  renderDetails();
  updatePager();
}
function renderCrumbs(scene) {
  crumbs.replaceChildren();
  for (const [index, crumb] of currentModel().breadcrumb().entries()) {
    if (index) crumbs.append(document.createTextNode(' / '));
    const button = document.createElement('button');
    button.className = 'crumb';
    button.textContent = crumb.name;
    button.addEventListener('click', () => {
      if (crumb.proxy) return;
      currentModel().navigateToFolder(crumb.id);
      draw();
    });
    crumbs.append(button);
  }
}
function renderDetails() {
  const d = currentModel().details();
  details.replaceChildren();
  if (!d) { const p = document.createElement('p'); p.className = 'subtle'; p.textContent = '노드나 묶음을 선택하세요.'; details.append(p); return; }
  const title = document.createElement('h2'); title.textContent = d.name; details.append(title);
  const lines = [];
  if (d.proxy) {
    lines.push('시각적 묶음 · 실제 폴더가 아닙니다.');
    lines.push(`${d.count}개 구성원 · 파일 미리보기와 편집을 제공하지 않습니다.`);
    lines.push(`proxy ID: ${d.id}`);
  } else {
    lines.push(d.nodeKind === 'folder' ? '폴더' : '파일');
    lines.push(d.path);
    lines.push(`ID: ${d.id}`);
    if (d.attachmentId) lines.push('첨부 참조가 있는 데이터 노드입니다.');
  }
  for (const line of lines) { const p = document.createElement('p'); p.textContent = line; details.append(p); }
  if (d.proxy) {
    const b = document.createElement('button'); b.textContent = '이 묶음 펼치기';
    b.addEventListener('click', () => { currentModel().expandCluster(d.id); draw(); }); details.append(b);
  } else if (d.nodeKind === 'folder') {
    const b = document.createElement('button'); b.textContent = '폴더 열기';
    b.addEventListener('click', () => { currentModel().enterFolder(d.id); draw(); }); details.append(b);
  }
}
function updatePager() {
  const s = currentModel().state;
  const prev = document.getElementById('prev-page'); const next = document.getElementById('next-page');
  prev.disabled = !s.query || s.searchPage <= 1;
  next.disabled = !s.query || s.searchPage >= s.searchPages;
  searchSummary.textContent = s.query ? `“${s.query}” · ${s.searchTotal}개 · ${s.searchPage}/${s.searchPages || 1} 페이지` : '';
}
function runSearch(page = 1) {
  const query = document.getElementById('query').value;
  state.search = currentModel().search(query, page);
  renderResults();
  updatePager();
  draw();
}
function renderResults() {
  results.replaceChildren();
  if (!state.search) return;
  if (!state.search.total) { const p = document.createElement('p'); p.className = 'subtle'; p.textContent = '일치하는 노드가 없습니다.'; results.append(p); return; }
  const heading = document.createElement('h2'); heading.textContent = `검색 결과 ${state.search.total}개 · ${state.search.page}/${state.search.pages} 페이지`; results.append(heading);
  for (const item of state.search.results) {
    const b = document.createElement('button'); b.className = 'result'; b.dataset.id = item.id;
    b.textContent = `${item.name} · ${item.kind} · ${item.path} · ${item.id}`;
    b.addEventListener('click', () => { currentModel().revealSearchResult(item.id); draw(); });
    results.append(b);
  }
  const p = document.createElement('p'); p.className = 'subtle'; p.textContent = `이 페이지 ${state.search.results.length}개 · 전체 ${state.search.total}개를 페이지로 모두 탐색할 수 있습니다.`; results.append(p);
}

document.getElementById('back').addEventListener('click', () => { currentModel().back(); draw(); });
document.getElementById('overview').addEventListener('click', () => { currentModel().overview(); draw(); });
document.getElementById('search-button').addEventListener('click', () => runSearch(1));
document.getElementById('query').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(1); });
document.getElementById('prev-page').addEventListener('click', () => runSearch(Math.max(1, currentModel().state.searchPage - 1)));
document.getElementById('next-page').addEventListener('click', () => runSearch(Math.min(currentModel().state.searchPages, currentModel().state.searchPage + 1)));
document.getElementById('load').addEventListener('click', () => loadFixture(shapeEl.value, Number(totalEl.value)));
graph.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-node-id]');
  if (target) return;
  const rect = graph.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * LAYOUT_WIDTH;
  const y = (event.clientY - rect.top) / rect.height * LAYOUT_HEIGHT;
  const id = hitTestLayout(state.layout, x, y);
  if (id && !currentModel().isProxy(id)) { currentModel().select(id); draw(); }
});

function loadFixture(shape, total) {
  state.shape = shape; state.total = total;
  shapeEl.value = shape; totalEl.value = String(total);
  state.model = new LodPresentationModel(buildFixture(shape, total), { clusterSize: state.clusterSize });
  state.search = null;
  document.getElementById('query').value = '';
  results.replaceChildren();
  draw();
}

const api = {
  loadFixture(shape, total, clusterSize = 40) {
    state.clusterSize = validateClusterSize(clusterSize);
    loadFixture(shape, total);
    return api.stats();
  },
  state() { return { ...currentModel().context(), query: currentModel().state.query, mode: currentModel().buildScene().mode, shape: state.shape, total: state.total, clusterSize: state.clusterSize }; },
  stats() {
    const layout = state.layout;
    return {
      shape: state.shape, total: state.total, mode: layout.sceneMode,
      sceneNodes: layout.all.length, labels: 1 + layout.nodes.filter((node) => node.showLabel).length,
      proxies: layout.nodes.filter((n) => n.proxy).length, rings: layout.ringCount,
      bounds: layout.bounds, clusterCount: layout.clusterCount, ...currentModel().context()
    };
  },
  labelStats() {
    const graphRect = graph.getBoundingClientRect();
    const labels = [...graph.querySelectorAll('text.label')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent, priority: element.classList.contains('priority-label') || element.classList.contains('current-label'), ...rect.toJSON() };
    });
    const clipped = labels.filter((rect) => rect.left < graphRect.left || rect.top < graphRect.top || rect.right > graphRect.right || rect.bottom > graphRect.bottom);
    const priority = labels.filter((label) => label.priority);
    const collisions = [];
    for (let i = 0; i < priority.length; i += 1) {
      for (let j = i + 1; j < priority.length; j += 1) {
        const a = priority[i]; const b = priority[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([a.text, b.text]);
      }
    }
    return { total: labels.length, priority: priority.length, clipped: clipped.map((label) => label.text), priorityCollisions: collisions, bounds: { left: graphRect.left, top: graphRect.top, right: graphRect.right, bottom: graphRect.bottom } };
  },
  centerOf(id) {
    const node = state.layout?.all.find((entry) => entry.id === id);
    if (!node) return null;
    const rect = graph.getBoundingClientRect();
    return { x: rect.left + node.x / LAYOUT_WIDTH * rect.width, y: rect.top + node.y / LAYOUT_HEIGHT * rect.height, layoutX: node.x, layoutY: node.y };
  },
  hitTest(x, y) { return hitTestLayout(state.layout, x, y); },
  select(id) { const d = currentModel().select(id); draw(); return d; },
  enterFolder(id) { currentModel().enterFolder(id); draw(); return api.stats(); },
  expandCluster(id) { currentModel().expandCluster(id); draw(); return api.stats(); },
  back() { currentModel().back(); draw(); return api.stats(); },
  overview() { currentModel().overview(); draw(); return api.stats(); },
  reveal(id) { currentModel().revealNode(id); draw(); return api.stats(); },
  search(query, page = 1) { state.search = currentModel().search(query, page); renderResults(); updatePager(); draw(); return state.search; },
  revealSearchResult(id) { currentModel().revealSearchResult(id); draw(); return api.stats(); },
  documentIds() { return currentModel().documentIdsList(); },
  documentInfo(id) { const record = currentModel().documentRecord(id); return record ? { id, name: record.node.name, kind: record.node.kind, path: record.path.join(' / ') } : null; },
  deepestId() { let best = null; for (const [id, record] of currentModel().index) if (!best || record.depth > currentModel().index.get(best).depth) best = id; return best; },
  visibleIds() { return state.layout?.nodes.map((node) => node.id) || []; },
  proxyIds() { return currentModel().proxyIdsList(); },
  revealAll() {
    const start = performance.now();
    const ids = currentModel().documentIdsList();
    let failures = 0;
    for (const id of ids) {
      currentModel().revealNode(id);
      if (currentModel().state.selectedId !== id) failures += 1;
      const scene = currentModel().buildScene();
      if (!scene.items.some((item) => item.id === id) && scene.folder.id !== id) failures += 1;
    }
    draw();
    return { count: ids.length, failures, ms: performance.now() - start };
  },
  sourceSnapshot() { return JSON.stringify(currentModel().root); }
};
window.stage2b1 = api;
loadFixture('mixed', 1000);








