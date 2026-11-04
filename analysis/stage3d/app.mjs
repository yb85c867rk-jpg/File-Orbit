import {
  buildSaveSnapshot, createPersistenceRepository, openPersistenceDatabase,
  deletePersistenceDatabase
} from '../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../src/engine/hypertree/editor/attachments.js';
import { createInternalPolicyContext } from '../../src/engine/hypertree/edition/index.js';
import { createSavedDocumentLodBridge } from '../../src/engine/hypertree/lod/saved-document-bridge.js';
import { buildLodFixture } from './fixture.mjs';

const PAID = createInternalPolicyContext({ edition: 'paid' });
const DB = `stage3d-browser-${Date.now()}`;
const state = { loaded: null, bridge: null, mounted: false, page: 1, lastRender: null, labels: null, search: null, previewUrl: null, liveSentinel: { untouched: true } };
const $ = (selector) => document.querySelector(selector);
const host = $('#lod-host');

function setStatus(text, kind = '') { const el = $('#status'); el.textContent = text; el.dataset.kind = kind; }
function folderLabel(item) { return item.proxy ? item.cluster.label : item.node.name; }
function renderCrumbs() {
  const crumbs = state.bridge.breadcrumb();
  $('#crumbs').replaceChildren(...crumbs.map((crumb, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = crumb.name; button.dataset.crumb = crumb.id; button.dataset.index = String(index);
    button.disabled = index === crumbs.length - 1;
    button.addEventListener('click', () => {
      if (crumb.proxy) { state.bridge.overview(); }
      else { state.bridge.openFolder(crumb.id); }
      refresh();
    });
    return button;
  }));
}
function renderItems(scene) {
  const list = $('#items'); list.replaceChildren();
  for (const item of scene.items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'item';
    button.dataset.id = item.id; button.dataset.kind = item.proxy ? 'cluster' : item.node.kind;
    button.textContent = item.proxy ? item.cluster.label : `${item.node.name}${item.node.kind === 'folder' ? ' /' : ''}`;
    button.addEventListener('click', () => {
      if (item.proxy) state.bridge.expandCluster(item.id);
      else if (item.node.kind === 'folder') state.bridge.openFolder(item.id);
      else state.bridge.select(item.id);
      refresh();
    });
    list.appendChild(button);
  }
}
function renderDetails() {
  const details = state.bridge.details();
  const panel = $('#details');
  if (!details) { panel.textContent = 'No selection'; return; }
  panel.replaceChildren();
  const title = document.createElement('strong'); title.textContent = details.name; panel.appendChild(title);
  const meta = document.createElement('pre'); meta.textContent = JSON.stringify({ kind: details.kind, id: details.id, path: details.path, canPreview: details.canPreview, proxy: details.proxy, attachmentId: details.attachmentId ?? null }, null, 2); panel.appendChild(meta);
  if (details.canPreview) {
    const button = document.createElement('button'); button.type = 'button'; button.id = 'preview'; button.textContent = 'Preview';
    button.addEventListener('click', () => {
      const preview = state.bridge.preview(details.id);
      const output = $('#preview-output');
      if (!preview) { output.textContent = 'Preview unavailable'; return; }
      // The bridge owns candidate preview URLs; the app never revokes them.
      state.previewUrl = preview.url;
      output.replaceChildren();
      const label = document.createElement('div'); label.textContent = preview.name; output.appendChild(label);
      if (/\.png$/i.test(preview.name)) { const img = document.createElement('img'); img.src = preview.url; img.alt = preview.name; img.id = 'preview-image'; output.appendChild(img); }
      else if (/\.pdf$/i.test(preview.name)) { const embed = document.createElement('embed'); embed.src = preview.url; embed.type = 'application/pdf'; embed.id = 'preview-pdf'; output.appendChild(embed); }
      else { const iframe = document.createElement('iframe'); iframe.src = preview.url; iframe.id = 'preview-text'; output.appendChild(iframe); }
      setStatus(`Preview ${preview.name}`, 'ok');
    });
    panel.appendChild(button);
  }
}
function renderSearch() {
  const search = state.search;
  const list = $('#search-results'); list.replaceChildren();
  if (!search) { $('#search-info').textContent = ''; return; }
  $('#search-info').textContent = search.total ? `${search.page}/${search.pages} of ${search.total}` : 'No results';
  for (const result of search.results) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.result = result.id; button.textContent = `${result.name} — ${result.path}`;
    button.addEventListener('click', () => { state.bridge.revealSearchResult(result.id); state.page = 1; refresh(); });
    list.appendChild(button);
  }
}
function activate(id) {
  const scene = state.bridge.scene();
  const item = scene.items.find((entry) => entry.id === id);
  if (item?.proxy) state.bridge.expandCluster(id);
  else if (item?.node?.kind === 'folder') state.bridge.openFolder(id);
  else if (item) state.bridge.select(id);
  refresh();
}
function refresh() {
  const scene = state.bridge.scene();
  renderCrumbs(); renderItems(scene); renderDetails(); renderSearch();
  $('#folder-name').textContent = scene.folder.name; $('#folder-id').textContent = scene.folder.id;
  const pageInfo = $('#page-info'); if (pageInfo) pageInfo.textContent = `Page ${scene.page}/${scene.pages} · ${scene.total} items`;
  const prev = $('#page-prev'); const next = $('#page-next');
  if (prev) prev.disabled = !(scene.page > 1);
  if (next) next.disabled = !(scene.page < scene.pages);
  state.lastRender = state.bridge.render();
  state.labels = state.bridge.adapter.labelStats();
  $('#node-count').textContent = String(state.bridge.nodeCount);
  $('#presented').textContent = `${state.lastRender.nodeCount} nodes / ${state.lastRender.proxyCount} proxies / ${state.lastRender.labelCount} labels`;
  setStatus(`Mounted ${scene.mode} ${scene.folder.name}`, 'ok');
}
async function seed() {
  const repo = createPersistenceRepository({ indexedDB: globalThis.indexedDB, dbName: DB, policyContext: PAID });
  const registry = createAttachmentRegistry({ datasetToken: 11 });
  const fixture = buildLodFixture(1000, registry, globalThis.File);
  const snapshot = buildSaveSnapshot({ tree: fixture.tree, registry, datasetToken: 11, capturedRevision: 0, policyContext: PAID });
  const saved = await repo.save(snapshot);
  const loaded = await repo.load(saved.mapId);
  await repo.close?.();
  state.loaded = loaded;
  state.fixture = fixture;
  return loaded;
}
async function mount() {
  if (state.bridge) throw new Error('already mounted');
  if (!state.loaded) await seed();
  state.search = null; state.page = 1; state.previewUrl = null;
  $('#preview-output').replaceChildren(); $('#search-results').replaceChildren(); $('#search-info').textContent = '';
  state.bridge = createSavedDocumentLodBridge({ loaded: state.loaded, datasetToken: 21, viewport: { width: 900, height: 600 }, policyContext: PAID, host, width: 900, height: 600, clusterSize: 40, searchPageSize: 50 });
  state.mounted = true;
  refresh();
  const sentinel = { ...state.liveSentinel };
  if (sentinel.untouched !== true) throw new Error('live sentinel touched');
}
function unmount() {
  if (!state.bridge) return;
  state.bridge.dispose();
  state.bridge = null; state.mounted = false; state.lastRender = null; state.labels = null;
  state.previewUrl = null;
  host.replaceChildren(); $('#preview-output').replaceChildren(); $('#items').replaceChildren(); $('#search-results').replaceChildren(); $('#crumbs').replaceChildren();
  setStatus('Unmounted', '');
}
window.__STAGE3D__ = {
  get state() { return state; },
  mount, unmount,
  search(query, page = 1) { state.search = state.bridge.search(query, page); state.page = state.search.page; renderSearch(); },
  next() { if (!state.search) return; state.search = state.bridge.search(state.search.query, Math.min(state.search.pages, state.search.page + 1)); renderSearch(); },
  prev() { if (!state.search) return; state.search = state.bridge.search(state.search.query, Math.max(1, state.search.page - 1)); renderSearch(); },
  open(id) { activate(id); },
  back() { state.bridge.back(); refresh(); },
  pageNext() { state.bridge.pageNext(); refresh(); },
  pagePrev() { state.bridge.pagePrev(); refresh(); },
  graphPoint(id) { const scene = state.bridge.renderResult?.scene; const node = scene?.nodes?.get(id); const canvas = host.querySelector('canvas'); if (!node || !canvas) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + node.center.x, y: r.top + node.center.y, radius: node.radius }; },
  labelPoint(id) { const group = state.bridge.adapter.labels.getMetrics().labels.get(id); if (!group || group.style.display === 'none' || group.style.visibility === 'hidden') return null; const r = group.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }; },
  viewportMetrics() { const hr = host.getBoundingClientRect(); const c = host.querySelector('canvas')?.getBoundingClientRect(); return { host: { width: hr.width, height: hr.height }, canvas: c ? { width: c.width, height: c.height } : null, surface: state.bridge.adapter.surface.getMetrics(), labels: state.bridge.adapter.labelStats(), render: state.bridge.renderResult }; }
};
$('#mount').addEventListener('click', () => mount().catch((error) => setStatus(error.message, 'err')));
$('#unmount').addEventListener('click', unmount);
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); const q = new FormData(event.currentTarget).get('q'); window.__STAGE3D__.search(String(q || '')); });
$('#next').addEventListener('click', () => window.__STAGE3D__.next());
$('#prev').addEventListener('click', () => window.__STAGE3D__.prev());
$('#back').addEventListener('click', () => window.__STAGE3D__.back());
$('#page-next').addEventListener('click', () => window.__STAGE3D__.pageNext());
$('#page-prev').addEventListener('click', () => window.__STAGE3D__.pagePrev());
host.addEventListener('click', (event) => {
  if (!state.bridge) return;
  const labelId = state.bridge.adapter.labelAtPoint(event.clientX, event.clientY);
  const canvas = host.querySelector('canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const nodeId = labelId || state.bridge.adapter.hitTest(event.clientX - rect.left, event.clientY - rect.top);
  if (nodeId) activate(nodeId);
});
setStatus('Ready to seed a 1,000-node repository document');







