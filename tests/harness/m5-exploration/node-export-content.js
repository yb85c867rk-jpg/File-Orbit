import { validateWebLink } from '../../../src/engine/hypertree/shared/web-link.js';

/** Pure filename/content helpers shared by single-file and folder export. */
export function dataExportContentExtension(details, record) {
  const original = String(record?.name || details?.attachment?.originalName || '');
  const originalExtension = original.includes('.') && !original.startsWith('.') ? original.split('.').pop().toLowerCase() : '';
  const classification = record?.classification || details?.attachment?.classification || null;
  const format = String(classification?.format || '');
  if (format === 'pdf') return 'pdf';
  if (format === 'markdown') return ['md', 'markdown'].includes(originalExtension) ? originalExtension : 'md';
  if (format === 'text') return ['txt', 'text', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv', 'log', 'html', 'htm', 'css', 'js', 'ts'].includes(originalExtension) ? originalExtension : 'txt';
  const classified = String(classification?.extension || '').replace(/^[.]+/, '').toLowerCase();
  if (classified) return classified;
  if (originalExtension) return originalExtension;
  const mime = String(record?.mime || record?.file?.type || '').toLowerCase();
  const known = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'text/plain': 'txt', 'text/markdown': 'md', 'application/json': 'json', 'application/zip': 'zip', 'application/octet-stream': 'bin' };
  return known[mime] || '';
}

export function sanitizeExportFilename(value, fallback) {
  let name = String(value || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim();
  name = name.replace(/[. ]+$/g, '');
  if (!name || name === '.' || name === '..') name = String(fallback || 'data').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_').trim() || 'data';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) name = '_' + name;
  if (name.length > 180) name = name.slice(0, 180 - ext.length) + ext;
  return name;
}

export function suggestedDataExportName(details, record) {
  const current = String(details?.name || record?.name || 'data');
  const extension = dataExportContentExtension(details, record);
  const currentExtension = current.includes('.') && !current.startsWith('.') ? current.split('.').pop() : '';
  let candidate = current;
  if (extension && !currentExtension) candidate = current + '.' + extension;
  else if (extension && currentExtension && currentExtension.toLowerCase() !== extension.toLowerCase()) candidate = current.slice(0, current.length - currentExtension.length - 1) + '.' + extension;
  return sanitizeExportFilename(candidate, record?.name || 'data');
}

export function suggestedWebLinkName(details) {
  const current = String(details?.name || 'link');
  const currentExtension = current.includes('.') && !current.startsWith('.') ? current.split('.').pop().toLowerCase() : '';
  const candidate = currentExtension === 'html' || currentExtension === 'htm' ? current : current.replace(/\.[^./]+$/, '') + '.html';
  return sanitizeExportFilename(candidate, 'link.html');
}

export function dataExportMime(details, record) {
  const mime = String(record?.mime || record?.classification?.mime || details?.attachment?.mime || record?.file?.type || '').trim();
  return /^[^\s/]+\/[^\s/]+$/.test(mime) ? mime : 'application/octet-stream';
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function buildWebLinkHtml({ name, link, description = null } = {}) {
  const checked = validateWebLink(link);
  if (!checked.ok || !checked.value) return { ok: false, reason: checked.reason || 'link-invalid', message: checked.message || 'Link must use http or https.' };
  const title = escapeHtml(name);
  const href = escapeHtml(checked.value);
  const descriptionHtml = typeof description === 'string' && description.length > 0
    ? `\n    <p class="description">${escapeHtml(description)}</p>`
    : '';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; color: #111827; background: #fff; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { overflow-wrap: anywhere; }
    .description { white-space: pre-wrap; overflow-wrap: anywhere; }
    a { color: #1d4ed8; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p><a href="${href}" rel="noopener noreferrer nofollow">${href}</a></p>${descriptionHtml}
  </main>
</body>
</html>`;
  return { ok: true, value: checked.value, html, bytes: new TextEncoder().encode(html) };
}
