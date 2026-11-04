import { buildTree } from './fixtures.mjs';
import { decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { FREE_POLICY_CONTEXT } from '../../../src/engine/hypertree/edition/index.js';
const $ = (s) => document.querySelector(s);
const state = { tree: null, rootId: null, focusId: null, selected: null, search: null, searchTarget: null, history: [], cameras: new Map(), camera: { x: 0, y: 0, scale: 1 }, viewport: { width: 800, height: 620 }, animation: null, dragging: null, previewUrl: null, previewAttachment: null, fixtureName: '' };
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
function makePdf() {
  const stream = 'BT /F1 18 Tf 20 100 Td (Sample PDF) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let body = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = body.length; body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets) body += String(offset).padStart(10, '0') + ' 00000 n \n';
  body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new TextEncoder().encode(body);
}
function sample(id, name, type, bytes, format, badge) { const file = new File([bytes], name, { type }); return { attachmentId: id, blob: file, metadata: { attachmentId: id, originalName: name, sizeBytes: file.size, mime: type, classification: { format, badge, mime: type, needsReview: false } } }; }
function samples() { return [sample('att-text','샘플-텍스트.txt','text/plain',new TextEncoder().encode('sample text content'),'text','TXT'),sample('att-image','샘플-이미지.png','image/png',PNG_BYTES,'image','PNG'),sample('att-pdf','샘플-PDF.pdf','application/pdf',makePdf(),'pdf','PDF'),sample('att-empty','빈-파일.txt','text/plain',new Uint8Array(0),'text','TXT')]; }
function findNode(id, node = state.tree) { if (!node) return null; if (node.id === id) return node; for (const child of node.children || []) { const found = findNode(id, child); if (found) return found; } return null; }
function parentOf(id, node = state.tree, parent = null) { if (!node) return null; if (node.id === id) return parent; for (const child of node.children || []) { const found = parentOf(id, child, node); if (found !== null) return found; } return null; }
function pathTo(id) { const path = []; let node = findNode(id); while (node) { path.unshift(node); if (node.id === state.rootId) break; node = parentOf(node.id); } return path; }
function displayRoot(node) { return node.name === 'map-input' ? node : node; }
async function loadFixture() {
  const fixture = $('#fixture').value;
  if (fixture === '20-categories') {
    const response = await fetch('./fixtures/20-categories.orbit'); if (!response.ok) throw new Error('20-category fixture missing');
    const decoded = await decodeBackup(await response.blob(), { policyContext: FREE_POLICY_CONTEXT });
    const mapInput = findNodeByName(decoded.tree, 'map-input') || decoded.tree;
    state.tree = decoded.tree; state.rootId = mapInput.id; state.fixtureName = '20 categories · depth 3–7';
    state.attachments = new Map(decoded.attachments.map((a) => [a.attachmentId, a]));
  } else {
    const [shapeName, suffix] = fixture.split('-'); const shape = shapeName; const count = suffix === '1000' ? 1000 : Number(document.querySelector('#count').value); const records = samples();
    const tree = buildTree(shape, count, { text:'att-text', image:'att-image', pdf:'att-pdf', empty:'att-empty' });
    state.tree = tree; state.rootId = tree.id; state.fixtureName = `${shape} · ${count} nodes · ${count === 1000 ? 'internal paid-test context' : 'free context'}`;
    state.attachments = new Map(records.map((a) => [a.attachmentId, a]));
  }
  state.focusId = state.rootId; state.selected = null; state.search = null; state.searchTarget = null; state.history = []; state.cameras.clear(); state.animation = null; state.camera = { x: 0, y: 0, scale: 1 };
}
function findNodeByName(node, name) { if (node.name === name) return node; for (const child of node.children || []) { const found = findNodeByName(child, name); if (found) return found; } return null; }
function focusNode() { return findNode(state.focusId); }
function visibleScene() {
  const focus = focusNode(); const children = (focus?.children || []).filter((c) => c.kind === 'folder' || c.kind === 'file');
  const count = children.length; const capacity = count <= 12 ? 12 : Math.ceil(count / 2); const rings = Math.ceil(count / capacity);
  const nodes = [{ node: focus, id: focus.id, x: 0, y: 0, radius: 34, kind: 'folder', anchor: true }];
  let index = 0;
  for (let ring = 0; ring < rings; ring += 1) { const inRing = Math.min(capacity, count - index); const radius = 190 + ring * 150; for (let i = 0; i < inRing; i += 1) { const angle = (Math.PI * 2 * i) / inRing - Math.PI / 2; const child = children[index]; nodes.push({ node: child, id: child.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, radius: child.kind === 'folder' ? 24 : 14, kind: child.kind }); index += 1; } }
  return nodes;
}
function sceneBounds(nodes) { const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y); return { minX: Math.min(...xs) - 70, maxX: Math.max(...xs) + 70, minY: Math.min(...ys) - 70, maxY: Math.max(...ys) + 70 }; }
function fitCamera(nodes = visibleScene()) { const bounds = sceneBounds(nodes); const width = state.viewport.width; const height = state.viewport.height; const scale = Math.max(0.25, Math.min(2.2, Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY)) * 0.9)); return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, scale }; }
function screenOf(node) { return { x: state.viewport.width / 2 + (node.x - state.camera.x) * state.camera.scale, y: state.viewport.height / 2 + (node.y - state.camera.y) * state.camera.scale }; }
function animateTo(camera) { state.animation = { from: { ...state.camera }, to: { ...camera }, started: performance.now(), duration: 320 }; }
function cancelAnimation() { state.animation = null; }
function navigate(id, { camera = null, selected = null } = {}) { if (!findNode(id)) return; state.history.push({ focusId: state.focusId, selected: state.selected, camera: { ...state.camera } }); state.focusId = id; state.selected = selected; state.searchTarget = null; const nodes = visibleScene(); animateTo(camera || fitCamera(nodes)); render(); }
function back() { const prior = state.history.pop(); if (!prior) return; state.focusId = prior.focusId; state.selected = prior.selected; state.searchTarget = null; animateTo(prior.camera || fitCamera()); render(); }
function root() { if (state.focusId === state.rootId) return; state.history.push({ focusId: state.focusId, selected: state.selected, camera: { ...state.camera } }); state.focusId = state.rootId; state.selected = null; state.searchTarget = null; animateTo(fitCamera()); render(); }
function activateNode(id) { const node = findNode(id); if (!node) return; if (node.kind === 'folder') navigate(id); else { state.selected = id; render(); } }
function render() {
  if (!state.tree) return; const canvas = $('#graph'); const dpr = window.devicePixelRatio || 1; const width = canvas.clientWidth; const height = canvas.clientHeight;
  state.viewport = { width, height }; canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr); const context = canvas.getContext('2d'); context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
  const nodes = visibleScene(); const focus = focusNode(); const bounds = sceneBounds(nodes); const camera = state.camera;
  context.fillStyle = '#020617'; context.fillRect(0, 0, width, height);
  for (const node of nodes) { if (node.anchor) continue; const p = screenOf(node), c = screenOf(nodes[0]); context.strokeStyle = node.kind === 'folder' ? '#64748b' : '#334155'; context.globalAlpha = 0.55; context.beginPath(); context.moveTo(c.x, c.y); context.lineTo(p.x, p.y); context.stroke(); context.globalAlpha = 1; }
  for (const node of nodes) { const p = screenOf(node); const radius = Math.max(4, node.radius * camera.scale); let fill = node.kind === 'folder' ? '#1d4ed8' : '#475569'; if (node.id === state.selected) fill = '#f59e0b'; if (node.id === state.searchTarget) fill = '#60A5FA'; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fillStyle = fill; context.fill(); context.strokeStyle = node.anchor ? '#e2e8f0' : '#0f172a'; context.lineWidth = node.anchor ? 3 : 2; context.stroke();
    const visibleLabel = node.anchor || node.id === state.selected || node.id === state.searchTarget || camera.scale > 0.75; if (visibleLabel) { const name = node.node?.name || ''; context.fillStyle = '#f8fafc'; context.font = node.anchor ? '600 15px system-ui' : '12px system-ui'; context.textAlign = 'center'; const label = name.length > 26 ? name.slice(0, 24) + '…' : name; context.fillText(label, p.x, p.y + radius + 16); }
    if (node.kind === 'file' && /\.pdf$/i.test(node.node?.name || '')) { context.fillStyle = '#F87171'; context.font = 'bold 9px system-ui'; context.textAlign = 'center'; context.fillText('PDF', p.x, p.y + 3); }
  }
  $('#crumbs').replaceChildren(...pathTo(state.focusId).map((node) => { const button = document.createElement('button'); button.textContent = node.name; button.disabled = node.id === state.focusId; button.addEventListener('click', () => { if (node.id === state.rootId) { root(); } else { state.history.push({ focusId: state.focusId, selected: state.selected, camera: { ...state.camera } }); state.focusId = node.id; state.selected = null; state.searchTarget = null; animateTo(state.cameras.get(node.id) || fitCamera()); render(); } }); return button; }));
  $('#focus').textContent = `Current: ${focus?.name || ''} · ${focus?.children?.length || 0} children · ${state.fixtureName}`;
  $('#selection').textContent = state.selected ? `Selected: ${findNode(state.selected)?.name}` : 'No file selected';
  $('#search-info').textContent = state.search ? `${state.search.total} matches · page ${state.search.page}/${state.search.pages}` : '';
  renderSearch(); syncControls();
}
function renderSearch() { const list = $('#results'); list.replaceChildren(); if (!state.search) return; for (const result of state.search.results) { const button = document.createElement('button'); button.textContent = `${result.name} — ${result.path}`; button.addEventListener('click', () => revealResult(result.id)); list.appendChild(button); } $('#search-prev').disabled = !state.search || state.search.page <= 1; $('#search-next').disabled = !state.search || state.search.page >= state.search.pages; $('#search-clear').disabled = !state.search; }
function allNodes(node = state.tree, path = '', out = []) { const here = path ? `${path} / ${node.name}` : node.name; for (const child of node.children || []) { const childPath = `${here} / ${child.name}`; if (state.rootId === node.id || path) { /* noop */ } allNodes(child, childPath, out); if (child.name.toLowerCase().includes(state.search?.query?.toLowerCase?.() || '')) out.push({ id: child.id, name: child.name, path: here }); } return out; }
function search(query, page = 1) { const q = query.trim().toLowerCase(); if (!q) { state.search = null; state.searchTarget = null; render(); return; } const matches = []; const walk = (node, path) => { for (const child of node.children || []) { const childPath = path ? `${path} / ${child.name}` : child.name; if (child.name.toLowerCase().includes(q)) matches.push({ id: child.id, name: child.name, path }); walk(child, childPath); } }; walk(findNode(state.rootId), ''); const pages = Math.ceil(matches.length / 50) || 0; const current = Math.max(1, Math.min(page, pages || 1)); state.search = { query, page: current, pages, total: matches.length, results: matches.slice((current - 1) * 50, current * 50) }; render(); }
function revealResult(id) { const chain = pathTo(id); if (!chain.length) return; const parent = chain[chain.length - 2]; if (!parent) return; state.history.push({ focusId: state.focusId, selected: state.selected, camera: { ...state.camera } }); state.focusId = parent.id; state.selected = id; state.searchTarget = id; state.cameras.set(parent.id, state.camera); animateTo(fitCamera()); render(); }
function syncControls() { const mounted = Boolean(state.tree); for (const id of ['#back', '#root-button', '#zoom-in', '#zoom-out', '#fit', '#search-next', '#search-prev', '#search-clear', '#preview']) { const control = $(id); if (control) control.disabled = !mounted; } }
function preview(id) { const node = findNode(id); if (!node) return; const attachmentId = node.data?.attachmentId; const data = attachmentId ? state.attachments.get(attachmentId) : null; const output = $('#preview-output'); clearPreview(); if (!data) { output.textContent = 'No supported preview'; return; } const url = URL.createObjectURL(data.blob); state.previewUrl = url; state.previewAttachment = data; const caption = document.createElement('div'); caption.textContent = node.name; output.appendChild(caption); if (/\.png$/i.test(node.name)) { const image = document.createElement('img'); image.src = url; image.style.width = '140px'; image.style.height = '140px'; image.style.imageRendering = 'pixelated'; output.appendChild(image); } else if (/\.pdf$/i.test(node.name)) { const embed = document.createElement('embed'); embed.src = url; embed.type = 'application/pdf'; embed.style.width = '240px'; embed.style.height = '180px'; output.appendChild(embed); } else { const frame = document.createElement('iframe'); frame.src = url; frame.style.width = '240px'; frame.style.height = '100px'; output.appendChild(frame); } }
function clearPreview() { if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; } $('#preview-output').replaceChildren(); }
function resetTransient() { state.search = null; state.searchTarget = null; state.selected = null; state.history = []; state.cameras.clear(); state.animation = null; state.camera = { x: 0, y: 0, scale: 1 }; $('#search-form input').value = ''; $('#results').replaceChildren(); $('#search-info').textContent = ''; $('#selection').textContent = 'No file selected'; clearPreview(); }
function mount() { resetTransient(); clearPreview(); return loadFixture().then(() => { state.camera = fitCamera(); render(); $('#status').textContent = `Mounted ${state.fixtureName}`; }).catch((error) => { state.tree = null; render(); $('#status').textContent = String(error?.message || error); }); }
function unmount() { resetTransient(); state.tree = null; state.rootId = null; state.focusId = null; $('#graph').getContext('2d').clearRect(0, 0, $('#graph').width, $('#graph').height); $('#crumbs').replaceChildren(); $('#focus').textContent = ''; $('#status').textContent = 'Unmounted'; renderSearch(); syncControls(); }
function zoom(factor) { cancelAnimation(); state.camera = { ...state.camera, scale: Math.max(0.2, Math.min(4, state.camera.scale * factor)) }; render(); }
function fit() { cancelAnimation(); state.camera = fitCamera(); render(); }
$('#mount').addEventListener('click', mount); $('#unmount').addEventListener('click', unmount);
$('#back').addEventListener('click', back); $('#root-button').addEventListener('click', root); $('#zoom-in').addEventListener('click', () => zoom(1.2)); $('#zoom-out').addEventListener('click', () => zoom(1 / 1.2)); $('#fit').addEventListener('click', fit);
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); search(String(new FormData(e.currentTarget).get('q') || ''), 1); });
$('#search-next').addEventListener('click', () => { if (state.search) search(state.search.query, state.search.page + 1); });
$('#search-prev').addEventListener('click', () => { if (state.search) search(state.search.query, state.search.page - 1); });
$('#search-clear').addEventListener('click', () => { state.search = null; state.searchTarget = null; render(); });
$('#preview').addEventListener('click', () => { if (state.selected) preview(state.selected); });
const canvas = $('#graph');
canvas.addEventListener('wheel', (event) => { if (!state.tree) return; event.preventDefault(); cancelAnimation(); const rect = canvas.getBoundingClientRect(); const px = event.clientX - rect.left; const py = event.clientY - rect.top; const before = { x: state.camera.x + (px - state.viewport.width / 2) / state.camera.scale, y: state.camera.y + (py - state.viewport.height / 2) / state.camera.scale }; const scale = Math.max(0.2, Math.min(4, state.camera.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); state.camera = { ...state.camera, scale, x: before.x - (px - state.viewport.width / 2) / scale, y: before.y - (py - state.viewport.height / 2) / scale }; render(); }, { passive: false });
canvas.addEventListener('pointerdown', (event) => { if (!state.tree || event.button !== 0) return; cancelAnimation(); state.dragging = { x: event.clientX, y: event.clientY, camera: { ...state.camera }, moved: false }; canvas.setPointerCapture?.(event.pointerId); });
canvas.addEventListener('pointermove', (event) => { if (!state.dragging) return; const dx = event.clientX - state.dragging.x, dy = event.clientY - state.dragging.y; if (Math.abs(dx) + Math.abs(dy) > 4) state.dragging.moved = true; state.camera = { ...state.dragging.camera, x: state.dragging.camera.x - dx / state.camera.scale, y: state.dragging.camera.y - dy / state.camera.scale }; render(); });
canvas.addEventListener('pointerup', () => { if (!state.dragging) return; state.suppressClick = state.dragging.moved; state.dragging = null; });
canvas.addEventListener('click', (event) => { if (!state.tree) return; if (state.suppressClick) { state.suppressClick = false; return; } const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; let best = null; for (const node of visibleScene()) { const p = screenOf(node); const radius = Math.max(6, node.radius * state.camera.scale) + 10; if (Math.hypot(x - p.x, y - p.y) <= radius && (!best || p.x < best.x)) best = { ...node, x: p.x }; } if (best) { if (best.kind === 'folder') navigate(best.id); else { state.selected = best.id; render(); preview(best.id); } } });
canvas.addEventListener('pointercancel', () => { state.dragging = null; });
function tick(now) { if (state.animation) { const t = Math.min(1, (now - state.animation.started) / state.animation.duration); const e = 1 - Math.pow(1 - t, 3); state.camera = { x: state.animation.from.x + (state.animation.to.x - state.animation.from.x) * e, y: state.animation.from.y + (state.animation.to.y - state.animation.from.y) * e, scale: state.animation.from.scale + (state.animation.to.scale - state.animation.from.scale) * e }; render(); if (t >= 1) { state.cameras.set(state.focusId, { ...state.camera }); state.animation = null; } } requestAnimationFrame(tick); }
requestAnimationFrame(tick);
window.__LARGE_MAP__ = { state, mount, unmount, navigate, back, root, search, revealResult, render, fit, zoom, preview, visibleScene, screenOf };
$('#status').textContent = 'Ready'; render();





