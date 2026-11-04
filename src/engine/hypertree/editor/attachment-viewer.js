export const PREVIEW_TEXT_LIMIT_BYTES = 1024 * 1024;
const PDF_FALLBACK_REVOKE_MS = 60_000;
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' });
function bytes(file, limit = 16) {
  return file.slice(0, limit).arrayBuffer().then((buffer) => new Uint8Array(buffer));
}
function hasYamlExtension(name) {
  if (typeof name !== 'string') return false;
  const base = name.split(/[\\\\/]/).at(-1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return false;
  const extension = base.slice(dot + 1).toLowerCase();
  return extension === 'yaml' || extension === 'yml';
}
function imageSignature(prefix) {
  if (prefix.length >= 8 && prefix[0] === 0x89 && prefix[1] === 0x50 && prefix[2] === 0x4e && prefix[3] === 0x47) return 'png';
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'jpeg';
  if (prefix.length >= 6 && String.fromCharCode(...prefix.slice(0, 6)) === 'GIF87a') return 'gif';
  if (prefix.length >= 6 && String.fromCharCode(...prefix.slice(0, 6)) === 'GIF89a') return 'gif';
  if (prefix.length >= 12 && String.fromCharCode(...prefix.slice(0, 4)) === 'RIFF' && String.fromCharCode(...prefix.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}
export async function resolveAttachmentViewerTarget({ details, registry }) {
  const attachment = details?.attachment;
  if (!attachment || typeof attachment.attachmentId !== 'string') return { ok: false, state: 'unavailable' };
  const record = registry?.get?.(attachment.attachmentId);
  if (!record?.file) return { ok: false, state: 'unavailable' };
  const originalName = attachment.originalName || record.name || details?.name || '';
  const yamlByName = hasYamlExtension(originalName);
  const stored = attachment.classification;
  const current = record.metadata?.classification;
  if (stored?.format && current?.format && stored.format !== current.format) return { ok: false, state: 'review' };
  const format = stored?.format || current?.format || 'unknown';
  if (format === 'pdf') return { ok: true, kind: 'pdf', file: record.file, originalName: attachment.originalName || record.name, classification: stored || current };
  if (format === 'text' || format === 'markdown') return { ok: true, kind: format, file: record.file, originalName: attachment.originalName || record.name, classification: stored || current };
  if (format === 'generic' && yamlByName) {
    return { ok: true, kind: 'text', file: record.file, originalName, classification: stored || current || { format: 'text', badge: 'YAML', reason: 'yaml-extension-legacy' } };
  }
  if (!stored?.format && !current?.format && yamlByName) {
    return { ok: true, kind: 'text', file: record.file, originalName, classification: { format: 'text', badge: 'YAML', reason: 'yaml-extension-legacy' } };
  }
  if (format === 'unknown' || stored?.needsReview || current?.needsReview) return { ok: false, state: 'review' };
  if (format === 'generic') {
    const prefix = await bytes(record.file, 16);
    const image = imageSignature(prefix);
    const mime = String(record.metadata?.mime || attachment.mime || '').toLowerCase();
    if (image && (!mime || mime === 'application/octet-stream' || mime === IMAGE_TYPES[image])) return { ok: true, kind: 'image', imageType: image, file: record.file, originalName: attachment.originalName || record.name, classification: stored || current };
  }
  return { ok: false, state: 'unsupported' };
}
function trimIncompleteUtf8(bytes) {
  for (let offset = 1; offset <= 4 && offset <= bytes.length; offset += 1) {
    const index = bytes.length - offset;
    const byte = bytes[index];
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte >= 0xf0 && byte <= 0xf4 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc2 ? 2 : 1;
    if (needed > offset) return bytes.slice(0, index);
    return bytes;
  }
  return bytes;
}
export function createAttachmentViewer({ document, host = document?.body, onClose = () => {}, onState = () => {} }) {
  if (!document || !host) throw new Error('document and host are required');
  const overlay = document.createElement('div');
  overlay.className = 'attachment-viewer-backdrop';
  overlay.hidden = true;
  const dialog = document.createElement('div');
  dialog.className = 'attachment-viewer';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const title = document.createElement('h2');
  const original = document.createElement('p');
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Close';
  const header = document.createElement('div'); header.append(title, closeButton);
  const status = document.createElement('p'); status.className = 'attachment-viewer-status';
  const body = document.createElement('div'); body.className = 'attachment-viewer-body';
  dialog.append(header, original, status, body);
  overlay.appendChild(dialog); host.appendChild(overlay);
  let active = false; let token = 0; let trigger = null; let abort = null;
  let currentState = 'closed'; let failureReason = null;
  let urls = []; const timers = new Set(); let deferredUrls = [];
  function revokeAll({ deferPdf = false } = {}) {
    for (const entry of urls) {
      if (entry.kind === 'pdf' && deferPdf) {
        deferredUrls.push(entry.url);
        const timer = setTimeout(() => { URL.revokeObjectURL(entry.url); deferredUrls = deferredUrls.filter((url) => url !== entry.url); timers.delete(timer); }, PDF_FALLBACK_REVOKE_MS);
        timers.add(timer);
      } else URL.revokeObjectURL(entry.url);
    }
    urls = [];
  }
  function resetBody() { body.replaceChildren(); status.textContent = ''; }
  function close() {
    if (!active) return;
    active = false; token += 1;
    if (abort) { abort.abort(); abort = null; }
    revokeAll({ deferPdf: true });
    overlay.hidden = true; resetBody(); body.className = 'attachment-viewer-body'; currentState = 'closed'; failureReason = null; onState({ state: 'closed', message: '' });
    if (trigger?.focus) trigger.focus(); trigger = null;
    onClose();
  }
  function finish(state, message = '') { if (!active) return false; currentState = state; failureReason = state === 'ready' || state === 'loading' ? null : message; status.textContent = message; body.setAttribute('data-state', state); onState({ state, message }); return true; }
  async function open({ details, registry }) {
    if (active) close();
    active = true; token += 1; const local = token;
    trigger = document.activeElement || null;
    overlay.hidden = false; resetBody(); body.setAttribute('data-state', 'loading'); status.textContent = 'Loading…'; currentState = 'loading'; failureReason = null; onState({ state: 'loading', message: '' });
    title.textContent = details?.name || 'Attachment';
    original.textContent = details?.attachment?.originalName || '';
    closeButton.focus();
    abort = new AbortController(); const signal = abort.signal;
    closeButton.addEventListener('click', close, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const focusables = [closeButton, ...Array.from(body.children || []).filter((child) => String(child.tagName || '').toUpperCase() === 'A' && child !== closeButton)];
      const index = focusables.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index < 0 || index === focusables.length - 1 ? 0 : index + 1);
      focusables[next]?.focus?.();
    }, { capture: true, signal });
    let target;
    try { target = await resolveAttachmentViewerTarget({ details, registry }); } catch { target = { ok: false, state: 'error' }; }
    if (!active || token !== local) return;
    if (!target.ok) {
      if (target.state === 'unavailable') finish('unavailable', 'This file is no longer available in this session.');
      else if (target.state === 'review') finish('review', 'This file needs format review before it can be viewed.');
      else if (target.state === 'error') finish('error', 'This file could not be read.');
      else finish('unsupported', 'This file format is not supported for viewing.');
      return;
    }
    if (target.kind === 'pdf') return openPdf(target, local);
    if (target.kind === 'text' || target.kind === 'markdown') return openText(target, local);
    return openImage(target, local);
  }
  function openPdf(target, local) {
    const source = target.file.type === 'application/pdf' ? target.file : new Blob([target.file], { type: 'application/pdf' });
    const url = URL.createObjectURL(source); urls.push({ url, kind: 'pdf' });
    const frame = document.createElement('iframe'); frame.className = 'attachment-viewer-pdf'; frame.title = target.originalName; frame.src = url;
    const fallback = document.createElement('a'); fallback.href = url; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer'; fallback.textContent = 'Open PDF in new tab';
    body.append(frame, fallback); finish('ready', 'PDF preview uses the browser’s native viewer when available.');
    if (local !== token) return;
  }
  async function openText(target, local) {
    const truncated = Number(target.file.size) > PREVIEW_TEXT_LIMIT_BYTES;
    try {
      const buffer = await target.file.slice(0, PREVIEW_TEXT_LIMIT_BYTES).arrayBuffer();
      if (!active || token !== local) return;
      const previewBytes = truncated ? trimIncompleteUtf8(new Uint8Array(buffer)) : new Uint8Array(buffer);
      let text = new TextDecoder('utf-8', { fatal: true }).decode(previewBytes).replace(/^\uFEFF/, '');
      if (target.kind === 'markdown') { const label = document.createElement('p'); label.className = 'attachment-viewer-note'; label.textContent = 'Markdown source'; body.appendChild(label); }
      if (truncated) { const notice = document.createElement('p'); notice.className = 'attachment-viewer-note'; notice.textContent = 'Preview truncated at 1 MiB.'; body.appendChild(notice); }
      const pre = document.createElement('pre'); pre.className = 'attachment-viewer-text'; pre.textContent = text; body.appendChild(pre);
      finish('ready');
    } catch { if (active && token === local) finish('error', 'This text file could not be decoded as UTF-8.'); }
  }
  function openImage(target, local) {
    const url = URL.createObjectURL(target.file); urls.push({ url, kind: 'image' });
    const img = document.createElement('img'); img.className = 'attachment-viewer-image'; img.alt = target.originalName;
    img.onload = () => { if (active && token === local) finish('ready'); };
    img.onerror = () => { if (active && token === local) finish('error', 'This image could not be displayed.'); };
    img.src = url; body.appendChild(img); finish('loading', 'Loading…');
  }
  return {
    open, close,
    get isOpen() { return active; },
    get state() { return currentState; },
    get failureReason() { return failureReason; },
    get urls() { return urls.map((entry) => ({ ...entry })); },
    destroy() { active = false; token += 1; if (abort) abort.abort(); abort = null; revokeAll({ deferPdf: false }); for (const url of deferredUrls) URL.revokeObjectURL(url); deferredUrls = []; for (const timer of timers) clearTimeout(timer); timers.clear(); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); },
    get element() { return overlay; }
  };
}








