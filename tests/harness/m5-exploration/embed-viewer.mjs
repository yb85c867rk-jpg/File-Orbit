import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, stageExplorationFrame, handleExplorationCanvasClick, folderContextLabelPriorityIds, parentMap } from '../../../src/engine/hypertree/exploration/index.js';
import { createCanvasSurface, createLabelOverlay, drawGraphScene, EXPLORATION_LABEL_PALETTE } from '../../../src/engine/hypertree/render/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, createMouseNavigationController, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { searchTree } from '../../../src/engine/hypertree/exploration/search.js';
import { highlightSearchFolderScene, searchHighlightToken } from '../../../src/engine/hypertree/exploration/search-highlight.js';
import { parseEmbedSnapshotMessage, EMBED_READY_TYPE, EMBED_LOADED_TYPE, EMBED_ERROR_TYPE, EMBED_SCHEMA, EMBED_VERSION } from './embed-snapshot.js';
import { normalizeParentOrigin, isAllowedParentEvent } from './embed-message-security.js';
import { themedCanvasScene } from './shell-controls.js';

const EMBED_PRESENTATION = Object.freeze({ rootFill: '#F8FAFC', rootStroke: '#F8FAFC', folderFill: '#B8BEC7', folderStroke: '#D1D5DB', fileFill: '#22C55E', fileStroke: '#22C55E', edgeStroke: '#454B54' });
const params = new URLSearchParams(location.search);
let expectedParentOrigin;
try { expectedParentOrigin = normalizeParentOrigin(params.get('parentOrigin'), location.origin); }
catch { expectedParentOrigin = null; }
const theme = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;

const stage = document.querySelector('#embed-stage');
const canvasHost = document.querySelector('#embed-canvas-host');
const labelHost = document.querySelector('#embed-label-host');
const searchInput = document.querySelector('#embed-search');
const searchClear = document.querySelector('#embed-clear');
const searchList = document.querySelector('#embed-results');
const backButton = document.querySelector('#embed-back');
const titleEl = document.querySelector('#embed-title');
const readOnlyEl = document.querySelector('#embed-readonly');
const noticeEl = document.querySelector('#embed-notice');
const statusEl = document.querySelector('#embed-status');
let graph; let tree; let baseLayout; let model; let session; let surface; let overlay; let frameState; let navigator; let parents;
let highlightIds = new Set(); let searchResultIds = new Set(); let destroyed = false;
const viewport = () => ({ width: Math.max(1, stage.clientWidth), height: Math.max(1, stage.clientHeight) });
const baseRadius = (vp = viewport()) => Math.max(1, Math.min(vp.width, vp.height) * 0.42);
const notice = (text, kind = 'info') => { if (!noticeEl) return; noticeEl.hidden = !text; noticeEl.dataset.kind = kind; noticeEl.textContent = text || ''; };

function labelPresentation() {
  const map = new Map();
  for (const [id, node] of graph.nodes) map.set(id, { name: node.name, kind: node.kind, dataType: node.data?.dataType, link: null, classification: node.data?.classification });
  return map;
}
function labelPriorityIds() {
  const selectedId = model?.selectedId ?? null;
  const view = model?.view?.();
  const selectedNode = selectedId ? graph.nodes.get(selectedId) : null;
  const folderId = selectedNode?.kind === 'folder' && view?.visibleSet?.has(selectedId) ? selectedId : view?.focusedFolderId;
  return [...new Set([...(selectedId ? [selectedId] : []), ...searchResultIds, ...folderContextLabelPriorityIds({ tree, view, folderId })].filter(Boolean))];
}
function draw(scene) {
  const themed = themedCanvasScene(scene, theme);
  const highlighted = highlightSearchFolderScene(themed, highlightIds, theme);
  drawGraphScene(surface, highlighted, {
    selectedId: model.selectedId,
    highlightedFolderIds: highlightIds,
    highlight: highlightIds.size > 0 ? { color: searchHighlightToken(theme).outline } : undefined
  });
}
function installFrame({ fit, entry, camera, framing, viewport: requestedViewport }) {
  const vp = requestedViewport || viewport();
  const prepared = stageExplorationFrame({
    graph, baseLayout, view: model.view(), viewport: vp, baseRadiusCss: baseRadius(vp),
    fit, entry, camera, framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: EMBED_PRESENTATION,
    adapters: {
      draw: (scene) => draw(scene),
      labels: (scene) => overlay.update({ scene, presentation: labelPresentation(), priorityIds: labelPriorityIds(), rootId: tree.id, selectedId: model?.selectedId ?? null }),
      installHit: () => {}
    }
  });
  frameState = { scene: prepared.scene, hit: prepared.hit, filtered: prepared.filtered, camera: prepared.camera, framing: prepared.framing, containment: prepared.containment };
  stage.dataset.focusedFolder = model.focusedFolderId;
  const atRoot = model.focusedFolderId === model.structuralRootId;
  backButton.hidden = atRoot; backButton.disabled = atRoot;
  return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
}
function mountNavigation() {
  navigator?.destroy?.();
  const state = session.getState();
  navigator = createMouseNavigationController(surface.canvas, {
    camera: state.camera, viewport: viewport(), cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    onCameraChange: (next) => { session.applyCamera(next, { kind: 'pan', viewport: viewport() }); }
  });
}
function redraw() {
  if (!frameState) return;
  draw(frameState.scene);
  overlay.update({ scene: frameState.scene, presentation: labelPresentation(), priorityIds: labelPriorityIds(), rootId: tree.id, selectedId: model?.selectedId ?? null });
}
function navigateTo(id) {
  const result = session.run('enter-folder', () => { const entered = model.enterFolder(id); return { ...entered, fit: entered.changed === true }; }, { fit: true, eventKind: 'user' });
  if (result.ok) { notice(''); redraw(); }
  return result;
}
function selectFile(id) {
  const result = session.run('select-file', () => ({ ...model.select(id), fit: false }), { fit: false, eventKind: 'user' });
  if (result.ok) notice('Read-only embedded preview: file attachments are not available.');
  return result;
}
function renderSearchResults(payload) {
  searchList.replaceChildren();
  if (!searchInput.value.trim()) { searchList.hidden = true; return; }
  searchList.hidden = false;
  if (!payload.ok) { const p = document.createElement('p'); p.className = 'embed-result-empty'; p.textContent = payload.message || 'Search failed.'; searchList.appendChild(p); return; }
  if (payload.total === 0) { const p = document.createElement('p'); p.className = 'embed-result-empty'; p.textContent = 'No matching nodes.'; searchList.appendChild(p); return; }
  for (const result of payload.results) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'embed-result';
    const name = document.createElement('strong'); name.textContent = result.name;
    const path = document.createElement('span'); path.textContent = result.parentPath || (result.kind === 'folder' ? 'Folder' : 'Data');
    button.append(name, path);
    button.addEventListener('click', () => {
      if (result.kind === 'folder') { navigateTo(result.id); return; }
      if (result.parentId && model.focusedFolderId !== result.parentId) navigateTo(result.parentId);
      selectFile(result.id);
    });
    searchList.appendChild(button);
  }
  if (payload.limited) { const p = document.createElement('p'); p.className = 'embed-result-empty'; p.textContent = `Showing ${payload.results.length} of ${payload.total} matches.`; searchList.appendChild(p); }
}
function runSearch() {
  const raw = searchInput.value;
  if (!tree || !raw.trim()) { highlightIds = new Set(); searchResultIds = new Set(); stage.dataset.highlightCount = '0'; stage.dataset.highlightQuery = ''; statusEl.textContent = 'Read-only local preview'; renderSearchResults({ ok: true, results: [], total: 0 }); redraw(); return; }
  const payload = searchTree(tree, raw, { datasetToken: 1, revision: 1 });
  highlightIds = new Set(payload.ok ? payload.folderIds : []);
  searchResultIds = new Set(payload.ok ? payload.results.map((result) => result.id) : []);
  stage.dataset.highlightCount = String(highlightIds.size);
  stage.dataset.highlightQuery = raw;
  statusEl.textContent = highlightIds.size > 0 ? `${highlightIds.size} folder${highlightIds.size === 1 ? '' : 's'} highlighted` : 'Read-only local preview';
  renderSearchResults(payload);
  redraw();
}
async function start(snapshot) {
  tree = snapshot.tree;
  graph = loadTree(tree, { limits: { maxNodes: 300 } }).graph;
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(staged, graph, { viewport: viewport(), padding: 24, phase: 'current', projectionBaseRadiusCss: baseRadius() });
  baseLayout = refined.staged;
  parents = parentMap(baseLayout);
  model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  surface = createCanvasSurface(canvasHost, { width: viewport().width, height: viewport().height, dpr: globalThis.devicePixelRatio || 1 });
  overlay = createLabelOverlay(labelHost, { maxLabels: 40, maxWidth: 180, placement: 'around', linkActivation: 'deferred', labelPalette: EXPLORATION_LABEL_PALETTE });
  session = createExplorationSession({ model, frame: installFrame, invalidate: () => { frameState = null; }, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  const initial = session.run('initial', () => ({ ok: true, fit: true }), { fit: true, viewport: viewport() });
  if (!initial.ok) throw initial.error || new Error('Unable to render embedded map');
  mountNavigation();
  surface.canvas.addEventListener('click', (event) => {
    const result = handleExplorationCanvasClick({ event, canvas: surface.canvas, frameState, session, model, graph,
      onFolder: ({ id }) => navigateTo(id),
      onDiagnostic: (diag) => { if (diag && !diag.ok) notice(diag.reason || 'The map could not be updated.', 'error'); }
    });
    if (result.ok && result.kind === 'file') notice('Read-only embedded preview: file attachments are not available.');
    const atRoot = model.focusedFolderId === model.structuralRootId;
    backButton.hidden = atRoot; backButton.disabled = atRoot;
  });
  searchInput.disabled = false;
  searchInput.addEventListener('input', runSearch);
  searchClear.addEventListener('click', () => { searchInput.value = ''; searchInput.focus(); runSearch(); });
  backButton.addEventListener('click', () => { const parent = parents.get(model.focusedFolderId); if (parent) navigateTo(parent); });
  const resizeObserver = new ResizeObserver(() => {
    if (destroyed || !surface) return;
    const vp = viewport();
    surface.resize({ width: vp.width, height: vp.height, dpr: globalThis.devicePixelRatio || 1 });
    try { session.applyCamera(session.getState().camera, { kind: 'resize', viewport: vp }); } catch {}
    mountNavigation();
  });
  resizeObserver.observe(stage);
  titleEl.textContent = snapshot.title;
  document.title = `${snapshot.title} — FileOrbit embed`;
  readOnlyEl.textContent = 'Read-only · No attachments';
  statusEl.textContent = 'Read-only local preview';
  stage.dataset.highlightCount = '0'; stage.dataset.highlightQuery = '';
  if (expectedParentOrigin) window.parent.postMessage({ type: EMBED_LOADED_TYPE, nodeCount: snapshot.nodeCount, title: snapshot.title }, expectedParentOrigin);
}
function postError(message) {
  statusEl.textContent = 'Preview unavailable';
  notice(message, 'error');
  if (expectedParentOrigin) { try { window.parent.postMessage({ type: EMBED_ERROR_TYPE, message: 'Embedded preview could not start.' }, expectedParentOrigin); } catch {} }
}
window.addEventListener('message', (event) => {
  if (!expectedParentOrigin || !isAllowedParentEvent(event, { expectedOrigin: expectedParentOrigin, parentWindow: window.parent })) return;
  if (!event.data || event.data.type !== 'fileorbit:embed:snapshot') return;
  if (graph) return;
  try {
    const snapshot = parseEmbedSnapshotMessage(event.data);
    start(snapshot).catch((error) => postError(String(error?.message || error)));
  } catch (error) { postError(String(error?.message || error)); }
});
window.addEventListener('beforeunload', () => { destroyed = true; navigator?.destroy?.(); surface?.destroy?.(); overlay?.destroy?.(); });
if (!expectedParentOrigin) postError('A concrete parent origin is required. This preview must be opened through the embed host.');
else { try { window.parent.postMessage({ type: EMBED_READY_TYPE, schema: EMBED_SCHEMA, version: EMBED_VERSION }, expectedParentOrigin); } catch { postError('This preview must be opened through the local embed host.'); } }
