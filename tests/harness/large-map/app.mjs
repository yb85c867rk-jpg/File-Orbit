import { buildTree } from './fixtures.mjs';
import { createEditableLodRuntime } from '../../../src/engine/hypertree/editor/runtime/index.js';
import { createInternalPolicyContext, FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';

const $ = (selector) => document.querySelector(selector);
const state = { runtime: null, search: null };
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
function makePdf() {
  const stream = 'BT /F1 18 Tf 20 100 Td (Sample PDF) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let body = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
function attachment(id, name, type, bytes, format, badge) {
  const file = new File([bytes], name, { type });
  return { attachmentId: id, blob: file, metadata: { attachmentId: id, originalName: name, sizeBytes: file.size, mime: type, classification: { format, badge, mime: type, needsReview: false } } };
}
function attachments() {
  return [
    attachment('att-text', '샘플-텍스트.txt', 'text/plain', new TextEncoder().encode('sample text content'), 'text', 'TXT'),
    attachment('att-image', '샘플-이미지.png', 'image/png', PNG_BYTES, 'image', 'PNG'),
    attachment('att-pdf', '샘플-PDF.pdf', 'application/pdf', makePdf(), 'pdf', 'PDF'),
    attachment('att-empty', '빈-파일.txt', 'text/plain', new Uint8Array(0), 'text', 'TXT')
  ];
}
function makeStage() {
  const stage = document.createElement('div'); stage.className = 'lods';
  stage.style.position = 'relative'; stage.style.width = '100%'; stage.style.height = '620px'; stage.style.overflow = 'hidden';
  return stage;
}
function resetTransient() {
  state.search = null;
  $('#search-form input').value = '';
  $('#results').replaceChildren(); $('#search-info').textContent = '';
  $('#preview-output').replaceChildren();
  $('#details').textContent = ''; $('#page').textContent = '';
  $('#items').replaceChildren(); $('#crumbs').replaceChildren();
  updateControls();
}
function clearPreview() { $('#preview-output').replaceChildren(); }
function updateControls() {
  const mounted = Boolean(state.runtime);
  for (const selector of ['#prev', '#next', '#search-prev', '#search-next', '#search-clear', '#preview']) {
    const control = $(selector); if (control) control.disabled = !mounted;
  }
}
async function mount() {
  if (state.runtime) { resetTransient(); state.runtime.dispose(); state.runtime = null; }
  resetTransient();
  const count = Number($('#count').value); const shape = $('#shape').value;
  const context = count === 1000 ? createInternalPolicyContext({ edition: 'paid' }) : FREE_POLICY_CONTEXT;
  const tree = buildTree(shape, count, { text: 'att-text', image: 'att-image', pdf: 'att-pdf', empty: 'att-empty' });
  const loaded = { map: { mapId: `large-map-${shape}-${count}`, generation: 1, nodeCount: count }, document: { tree }, attachments: attachments() };
  const host = makeStage(); $('#lod').replaceChildren(host);
  state.runtime = createEditableLodRuntime({ loaded, datasetToken: 1, viewport: { width: 900, height: 620 }, policyContext: context, host, candidateHostFactory: makeStage, width: 900, height: 620 });
  updateControls(); refresh();
  $('#status').textContent = `${shape} · ${count} nodes · ${count === 1000 ? 'internal paid-test context' : 'free context'} · prototype only`;
}
function refresh() {
  if (!state.runtime) { resetTransient(); return; }
  const runtime = state.runtime; const scene = runtime.scene(); const crumbs = runtime.bridge.breadcrumb();
  $('#crumbs').replaceChildren(...crumbs.map((crumb) => {
    const button = document.createElement('button'); button.textContent = crumb.name; button.disabled = crumb.id === scene.folder.id;
    button.addEventListener('click', () => { crumb.proxy ? runtime.bridge.overview() : runtime.openFolder(crumb.id); refresh(); });
    return button;
  }));
  const list = $('#items'); list.replaceChildren();
  for (const item of scene.items) {
    const button = document.createElement('button'); button.className = 'item'; button.dataset.id = item.id;
    button.textContent = item.proxy ? item.cluster.label : item.node.name;
    button.addEventListener('click', () => activate(item.id)); list.appendChild(button);
  }
  $('#page').textContent = `Page ${scene.page}/${scene.pages}`;
  $('#details').textContent = runtime.details() ? `${runtime.details().name} · ${runtime.details().id}` : 'No selection';
  runtime.render(); renderSearch(); updateControls();
}
function activate(id) {
  if (!state.runtime || !id) return;
  const runtime = state.runtime; const item = runtime.scene().items.find((entry) => entry.id === id);
  if (item?.proxy) runtime.expandCluster(id); else if (item?.node?.kind === 'folder') runtime.openFolder(id); else runtime.select(id);
  refresh();
}
function renderSearch() {
  const search = state.search; const list = $('#results'); list.replaceChildren();
  $('#search-info').textContent = search ? `${search.total} results · page ${search.page}/${search.pages}` : '';
  if (search) for (const item of search.results) {
    const button = document.createElement('button'); button.textContent = `${item.name} — ${item.path}`;
    button.addEventListener('click', () => { state.runtime?.bridge.model.revealSearchResult(item.id); refresh(); });
    list.appendChild(button);
  }
  if ($('#search-prev')) $('#search-prev').disabled = !state.runtime || !search || search.page <= 1;
  if ($('#search-next')) $('#search-next').disabled = !state.runtime || !search || search.page >= search.pages;
  if ($('#search-clear')) $('#search-clear').disabled = !state.runtime || !search;
}
$('#lod').addEventListener('click', (event) => {
  if (!state.runtime) return;
  const canvas = state.runtime.host?.querySelector('canvas'); if (!canvas) return;
  const labelId = state.runtime.bridge.adapter.labelAtPoint(event.clientX, event.clientY);
  const rect = canvas.getBoundingClientRect();
  const hitId = labelId || state.runtime.bridge.adapter.hitTest(event.clientX - rect.left, event.clientY - rect.top);
  if (hitId) activate(hitId);
});
$('#mount').addEventListener('click', () => mount().catch((error) => { $('#status').textContent = String(error?.message || error); }));
$('#unmount').addEventListener('click', () => { resetTransient(); state.runtime?.dispose(); state.runtime = null; $('#lod').replaceChildren(); $('#status').textContent = 'Unmounted'; updateControls(); });
$('#next').addEventListener('click', () => { if (!state.runtime) return; state.runtime.pageNext(); refresh(); });
$('#prev').addEventListener('click', () => { if (!state.runtime) return; state.runtime.pagePrev(); refresh(); });
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault(); if (!state.runtime) return;
  const query = String(new FormData(event.currentTarget).get('q') || '');
  state.search = state.runtime.search(query, 1); renderSearch(); updateControls();
});
$('#search-prev')?.addEventListener('click', () => { if (!state.runtime || !state.search) return; state.search = state.runtime.search(state.search.query, Math.max(1, state.search.page - 1)); renderSearch(); });
$('#search-next')?.addEventListener('click', () => { if (!state.runtime || !state.search) return; state.search = state.runtime.search(state.search.query, Math.min(state.search.pages, state.search.page + 1)); renderSearch(); });
$('#search-clear')?.addEventListener('click', () => { if (!state.runtime) return; state.search = null; state.runtime.search('', 1); renderSearch(); refresh(); });
$('#preview').addEventListener('click', () => {
  if (!state.runtime) return; const details = state.runtime.details(); if (!details) return;
  clearPreview(); const preview = state.runtime.preview(details.id); const output = $('#preview-output');
  if (!preview) { output.textContent = 'No preview'; return; }
  const caption = document.createElement('div'); caption.textContent = preview.name; output.appendChild(caption);
  if (/\.png$/i.test(preview.name)) { const image = document.createElement('img'); image.src = preview.url; image.style.width = '120px'; image.style.height = '120px'; image.style.imageRendering = 'pixelated'; output.appendChild(image); }
  else if (/\.pdf$/i.test(preview.name)) { const embed = document.createElement('embed'); embed.src = preview.url; embed.type = 'application/pdf'; embed.style.width = '240px'; embed.style.height = '180px'; output.appendChild(embed); }
  else { const frame = document.createElement('iframe'); frame.src = preview.url; frame.style.width = '240px'; frame.style.height = '100px'; output.appendChild(frame); }
});
window.__LARGE_MAP__ = { state, mount, unmount: () => $('#unmount').click(), refresh };
$('#status').textContent = 'Ready'; updateControls();
