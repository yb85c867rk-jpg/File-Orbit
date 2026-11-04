import { buildEmbedSnapshotMessage, sanitizeEmbedSnapshot } from './embed-snapshot.js';
import { createEmbedHandshake } from './embed-handshake.js';
import { parseViewerReady, parseViewerLoaded, parseViewerError } from './embed-message-security.js';

const frame = document.querySelector('#embed-frame');
const status = document.querySelector('#host-status');
const parentOrigin = location.origin;
let sent = false;
const setStatus = (text, state = '') => { status.textContent = text; status.dataset.state = state; };
const handshake = createEmbedHandshake({
  onStatus: setStatus,
  onReady: () => { loadSnapshot().then(startFrame).catch((error) => handshake.failed(String(error?.message || error))); },
  onTimeout: () => setStatus('Preview did not become ready.', 'error'),
  loadTimeoutMs: 10000,
  readyTimeoutMs: 10000
});

async function loadSnapshot() {
  const response = await fetch('./embed-sample.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Sample snapshot failed to load (${response.status}).`);
  return sanitizeEmbedSnapshot(await response.json());
}

function startFrame(snapshot) {
  if (sent || handshake.state !== 'loading-snapshot') return;
  sent = true;
  const message = buildEmbedSnapshotMessage({ schema: snapshot.schema, version: snapshot.version, title: snapshot.title, tree: snapshot.tree });
  frame.contentWindow.postMessage(message, parentOrigin);
}

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.origin !== parentOrigin) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
  if (data.type === 'fileorbit:embed:ready') {
    if (!parseViewerReady(data)) return;
    handshake.ready();
    return;
  }
  if (data.type === 'fileorbit:embed:loaded') {
    const loaded = parseViewerLoaded(data);
    if (!loaded) return;
    if (handshake.acknowledged()) setStatus(`Local read-only preview loaded · ${loaded.nodeCount} nodes`, 'ready');
    return;
  }
  if (data.type === 'fileorbit:embed:error') {
    const error = parseViewerError(data);
    if (error) handshake.lateError(error.message);
  }
});

frame.addEventListener('load', () => handshake.load());
frame.src = `./embed-viewer.html?parentOrigin=${encodeURIComponent(parentOrigin)}`;
