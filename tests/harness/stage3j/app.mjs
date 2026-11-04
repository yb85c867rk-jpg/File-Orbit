import { buildSaveSnapshot, createPersistenceRepository } from '../../../src/engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { createInternalPolicyContext } from '../../../src/engine/hypertree/edition/index.js';
import { createStage3JSession } from '../../../src/app/stage3j/session.js';
import { encodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { buildLodFixture } from '../../../analysis/stage3d/fixture.mjs';
const PAID = createInternalPolicyContext({ edition: 'paid' });
const DB = `stage3h-browser-${Date.now()}`;
const state = { loaded: null, runtime: null, stage: null, search: null, previewUrl: null, faults: { historyPublish: false }, sentinel: { untouched: true } };
const $ = (s) => document.querySelector(s);
const frame = $('#lod-frame');
const status = (text) => { $('#status').textContent = text; };
function makeStage() { const d = document.createElement('div'); d.className = 'lod-stage'; d.style.position = 'relative'; d.style.width = '100%'; d.style.height = '600px'; d.style.overflow = 'hidden'; return d; }
async function seedBlob() { const registry = createAttachmentRegistry({ datasetToken: 5 }); const fixture = buildLodFixture(1000, registry, globalThis.File); const pack = await encodeBackup({ tree: fixture.tree, registry, mapName: 'Stage 3J Harness', datasetToken: 5, policyContext: PAID }); return pack.blob; }
async function openFile(file) { const result = await state.session.openBackup(file, { name: file.name || 'Opened.orbit' }); if (!result.ok) { status('Open rejected: ' + String(result.reason || result.message)); return result; } state.loaded = state.session.current.loaded; state.runtime = state.session.current.runtime; state.stage = state.runtime.host; state.search = null; $('#preview-output').replaceChildren(); refresh(); status('Opened ' + String(file.name || 'document')); return result; }
async function saveAs() { const result = await state.session.saveAs({ name: state.session.mapName || 'FileOrbit map' }); if (!result.ok) { status('Save As failed: ' + String(result.reason || result.message)); return result; } const url = URL.createObjectURL(result.blob); const a = document.createElement('a'); a.href = url; a.download = result.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); status('Saved As ' + result.fileName); return result; }
async function roundTrip() { const saved = await state.session.saveAs({ name: 'Stage 3J round trip' }); if (!saved.ok) return saved; const reopened = await state.session.openBackup(saved.blob, { name: 'Stage 3J round trip' }); if (!reopened.ok) return reopened; state.runtime = state.session.current.runtime; state.loaded = state.session.current.loaded; state.stage = state.runtime.host; refresh(); return reopened; }
function activate(id) { const scene = state.runtime.scene(); const item = scene.items.find((entry) => entry.id === id); if (item?.proxy) state.runtime.expandCluster(id); else if (item?.node?.kind === 'folder') state.runtime.openFolder(id); else if (item) state.runtime.select(id); refresh(); }
function refresh() { const r = state.runtime; const scene = r.scene(); const crumbs = r.bridge.breadcrumb(); $('#crumbs').replaceChildren(...crumbs.map((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.dataset.index = String(i); b.disabled = i === crumbs.length - 1; b.addEventListener('click', () => { if (c.proxy) r.bridge.overview(); else r.openFolder(c.id); refresh(); }); return b; })); const list = $('#items'); list.replaceChildren(); for (const item of scene.items) { const b = document.createElement('button'); b.type = 'button'; b.className = 'item'; b.dataset.id = item.id; b.textContent = item.proxy ? item.cluster.label : item.node.name; b.addEventListener('click', () => activate(item.id)); list.appendChild(b); } const d = r.details(); $('#details').textContent = d ? `${d.id} · ${d.name}` : 'No selection'; $('#page-info').textContent = `Page ${scene.page}/${scene.pages} · ${scene.total}`; $('#undo').disabled = r.undoCount === 0; $('#redo').disabled = r.redoCount === 0; $('#dirty').textContent = r.dirty ? 'dirty' : 'clean'; $('#revision').textContent = String(r.revision); r.render(); state.stage = r.host; renderSearch(); }
function renderSearch() { const search = state.search; const list = $('#search-results'); list.replaceChildren(); if (!search) { $('#search-info').textContent = ''; return; } $('#search-info').textContent = search.total ? `${search.page}/${search.pages} of ${search.total}` : 'No results'; for (const result of search.results) { const b = document.createElement('button'); b.type = 'button'; b.dataset.result = result.id; b.textContent = `${result.name} — ${result.path}`; b.addEventListener('click', () => { state.runtime.bridge.model.revealSearchResult(result.id); refresh(); }); list.appendChild(b); } }
async function mount() { if (state.runtime) throw new Error('already mounted'); const stage = makeStage(); frame.replaceChildren(stage); const repo = createPersistenceRepository({ indexedDB: globalThis.indexedDB, dbName: DB, policyContext: PAID }); state.repository = repo; state.session = createStage3JSession({ repository: repo, policyContext: PAID, datasetToken: 7, viewport: { width: 900, height: 600 }, runtimeOptions: { host: stage, candidateHostFactory: makeStage, faults: state.faults, width: 900, height: 600 } }); const opened = await state.session.openBackup(await seedBlob(), { name: 'Stage 3J Harness' }); if (!opened.ok) throw new Error(opened.message || opened.reason); state.loaded = state.session.current.loaded; state.runtime = state.session.current.runtime; state.stage = state.runtime.host; state.search = null; $('#preview-output').replaceChildren(); $('#search-results').replaceChildren(); $('#search-form input').value = ''; refresh(); status('Mounted editable LOD runtime'); }
function unmount() { if (!state.runtime) return; state.session?.close?.(); state.session = null; state.runtime = null; frame.replaceChildren(); $('#preview-output').replaceChildren(); $('#items').replaceChildren(); $('#crumbs').replaceChildren(); status('Unmounted'); }
function transaction(kind, args) { const tx = state.runtime.prepare(kind, args); if (!tx.ok) { status(`${kind} rejected: ${tx.reason}`); return false; } const result = state.runtime.commit(tx); if (!result.ok) { status(`${kind} install failed: ${result.reason}`); return false; } refresh(); status(`${kind} committed`); return true; }
function selectedId() { return state.runtime.model.state.selectedId; }
window.__STAGE3H__ = {
  get state() { return state; }, mount, unmount,
  activate, select(id) { state.runtime.select(id); refresh(); }, rename() { const id = selectedId(); if (!id) return; transaction('rename', { targetId: id, draftName: $('#edit-name').value }); },
  metadata() { const id = selectedId(); if (!id) return; transaction('metadata', { targetId: id, description: $('#edit-desc').value, link: null, linkProvided: false }); },
  addFile() { const parentId = state.runtime.model.state.folderId; const bytes = new TextEncoder().encode('새 첨부 내용'); const meta = { attachmentId: 'att_browser_stage3h', originalName: '첨부-새.txt', sizeBytes: bytes.length, mime: 'text/plain', classification: { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false } }; const ok = transaction('add', { parentId, kind: 'file', draftName: '첨부-새.txt', draftDescription: '새 첨부', draftDataType: 'file', draftAttachment: meta, attachmentFile: new File([bytes], '첨부-새.txt', { type: 'text/plain' }) }); if (ok) { const id = state.runtime.model.documentIdsList().find((n) => state.runtime.model.documentRecord(n)?.node.name === '첨부-새.txt'); if (id) state.runtime.select(id); refresh(); } return ok; },
  selectFolder() { const id = state.runtime.model.state.folderId; state.runtime.select(id); refresh(); },
  openFile, saveAs, roundTrip,
  addFolder() { const parentId = state.runtime.model.state.folderId; transaction('add', { parentId, kind: 'folder', draftName: $('#edit-name').value || '새-폴더' }); },
  remove() { const id = selectedId(); if (!id) return; transaction('delete', { targetId: id }); },
  toggleHistoryFault() { state.faults.historyPublish = !state.faults.historyPublish; status('History fault ' + (state.faults.historyPublish ? 'armed' : 'cleared')); return state.faults.historyPublish; },
  undo() { const r = state.runtime.undo(); if (!r.ok) status('Undo rejected: ' + r.reason); else { refresh(); status('Undo committed'); } },
  redo() { const r = state.runtime.redo(); if (!r.ok) status('Redo rejected: ' + r.reason); else { refresh(); status('Redo committed'); } },
  search(q, page = 1) { state.search = state.runtime.search(q, page); renderSearch(); }, next() { if (state.search) { state.search = state.runtime.search(state.search.query, state.search.page + 1); renderSearch(); } }, prev() { if (state.search) { state.search = state.runtime.search(state.search.query, state.search.page - 1); renderSearch(); } },
  preview(id) { const p = state.runtime.preview(id); if (!p) return null; state.previewUrl = p.url; const out = $('#preview-output'); out.replaceChildren(); const label = document.createElement('div'); label.textContent = p.name; out.appendChild(label); if (/\.png$/i.test(p.name)) { const img = document.createElement('img'); img.id = 'preview-image'; img.src = p.url; out.appendChild(img); } else if (/\.pdf$/i.test(p.name)) { const e = document.createElement('embed'); e.id = 'preview-pdf'; e.src = p.url; out.appendChild(e); } else { const f = document.createElement('iframe'); f.id = 'preview-text'; f.src = p.url; out.appendChild(f); } return p; },
  pageNext() { state.runtime.pageNext(); refresh(); }, pagePrev() { state.runtime.pagePrev(); refresh(); }, graphPoint(id) { const node = state.runtime.bridge.renderResult?.scene?.nodes?.get(id); const canvas = state.stage?.querySelector('canvas'); if (!node || !canvas) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + node.center.x, y: r.top + node.center.y }; }, labelPoint(id) { const g = state.runtime.bridge.adapter.labels.getMetrics().labels.get(id); if (!g) return null; const r = g.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }
};
$('#mount').addEventListener('click', () => mount().catch((e) => status('Mount failed: ' + e.message)));
$('#unmount').addEventListener('click', unmount);
$('#rename').addEventListener('click', () => window.__STAGE3H__.rename());
$('#metadata').addEventListener('click', () => window.__STAGE3H__.metadata());
$('#add-folder').addEventListener('click', () => window.__STAGE3H__.addFolder());
$('#open-file').addEventListener('change', async (event) => { const file = event.currentTarget.files?.[0]; if (file) await openFile(file); event.currentTarget.value = ''; });
$('#save-as').addEventListener('click', () => window.__STAGE3H__.saveAs());
$('#add-file').addEventListener('click', () => window.__STAGE3H__.addFile());
$('#select-folder').addEventListener('click', () => window.__STAGE3H__.selectFolder());
$('#delete').addEventListener('click', () => window.__STAGE3H__.remove());
$('#undo').addEventListener('click', () => window.__STAGE3H__.undo());
$('#toggle-history-fault').addEventListener('click', () => window.__STAGE3H__.toggleHistoryFault());
$('#redo').addEventListener('click', () => window.__STAGE3H__.redo());
$('#page-next').addEventListener('click', () => window.__STAGE3H__.pageNext());
$('#page-prev').addEventListener('click', () => window.__STAGE3H__.pagePrev());
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); window.__STAGE3H__.search(String(new FormData(e.currentTarget).get('q') || '')); });
$('#next').addEventListener('click', () => window.__STAGE3H__.next());
$('#prev').addEventListener('click', () => window.__STAGE3H__.prev());
$('#preview-button').addEventListener('click', () => { const id = selectedId(); if (id) window.__STAGE3H__.preview(id); });
frame.addEventListener('click', (event) => { if (!state.runtime) return; const labelId = state.runtime.bridge.adapter.labelAtPoint(event.clientX, event.clientY); const canvas = state.stage?.querySelector('canvas'); if (!canvas) return; const rect = canvas.getBoundingClientRect(); const id = labelId || state.runtime.bridge.adapter.hitTest(event.clientX - rect.left, event.clientY - rect.top); if (id) activate(id); });
status('Ready');








