import { extensionOf } from '../render/label-classification.js';

export const ATTACHMENT_PREFIX_BYTES = 1024;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 100 * 1024 * 1024;
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'log']);
const YAML_EXTENSIONS = new Set(['yaml', 'yml']);
const YAML_MIME_TYPES = new Set(['application/yaml', 'application/x-yaml', 'application/vnd.yaml', 'text/yaml', 'text/x-yaml']);
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2D];

export function normalizeMime(value) {
  if (typeof value !== 'string') return '';
  return value.split(';')[0].trim().toLowerCase();
}
function isInconclusiveMime(mime) {
  return mime === '' || mime === 'application/octet-stream';
}
function isTextMime(mime) {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || YAML_MIME_TYPES.has(mime);
}
function isPdfMime(mime) { return mime === 'application/pdf'; }
function isBinaryMime(mime) {
  return mime !== '' && !isInconclusiveMime(mime) && !isTextMime(mime) && !isPdfMime(mime);
}
function hasPdfSignature(prefix) {
  if (!(prefix instanceof Uint8Array) || prefix.length < PDF_BYTES.length) return false;
  return PDF_BYTES.every((byte, index) => prefix[index] === byte);
}
function safeExtensionBadge(extension) {
  const cleaned = String(extension || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return cleaned || 'FILE';
}
function result(format, badge, confidence, needsReview, reason, extension, mime) {
  return Object.freeze({
    format, badge, confidence, needsReview, reason,
    extension: extension || null, mime: mime || null,
    classifier: 'fileorbit-attachment-v1'
  });
}

/**
 * Deterministic presentation classification. It does not certify safety or
 * parse the file. Only the bounded prefix is inspected.
 */
export function classifyAttachment({ name, mime, prefix } = {}) {
  const extension = extensionOf(name);
  const normalizedMime = normalizeMime(mime);
  const pdfSignature = hasPdfSignature(prefix);
  const pdfByName = extension === 'pdf';
  const pdfByMime = isPdfMime(normalizedMime);
  const markdown = MARKDOWN_EXTENSIONS.has(extension);
  const text = TEXT_EXTENSIONS.has(extension);
  const yaml = YAML_EXTENSIONS.has(extension);

  if (pdfSignature) {
    if (pdfByName || pdfByMime) return result('pdf', 'PDF', 'signature', false, 'pdf-signature', extension, normalizedMime);
    if (yaml || markdown || text) return result('unknown', '?', 'signature', true, 'signature-extension-conflict', extension, normalizedMime);
    return result('pdf', 'PDF', 'signature', false, 'pdf-signature', extension, normalizedMime);
  }
  if (pdfByName || pdfByMime) {
    return result('unknown', '?', pdfByName && pdfByMime ? 'extension-and-mime' : pdfByName ? 'extension' : 'mime', true, 'pdf-signature-missing', extension, normalizedMime);
  }
  if (markdown) {
    if (isBinaryMime(normalizedMime)) return result('unknown', '?', 'extension-and-mime', true, 'markdown-mime-conflict', extension, normalizedMime);
    if (isInconclusiveMime(normalizedMime)) return result('markdown', 'MD', 'extension', false, 'markdown-extension', extension, normalizedMime);
    return result('markdown', 'MD', isTextMime(normalizedMime) ? 'extension-and-mime' : 'extension', false, 'markdown-extension-and-mime', extension, normalizedMime);
  }
  if (yaml) {
    if (isBinaryMime(normalizedMime)) return result('unknown', '?', 'extension-and-mime', true, 'yaml-mime-conflict', extension, normalizedMime);
    if (isInconclusiveMime(normalizedMime)) return result('text', 'YAML', 'extension', false, 'yaml-extension', extension, normalizedMime);
    return result('text', 'YAML', isTextMime(normalizedMime) ? 'extension-and-mime' : 'extension', false, 'yaml-extension-and-mime', extension, normalizedMime);
  }
  if (text) {
    if (isBinaryMime(normalizedMime)) return result('unknown', '?', 'extension-and-mime', true, 'text-mime-conflict', extension, normalizedMime);
    return result('text', 'TXT', isTextMime(normalizedMime) ? 'extension-and-mime' : 'extension', false, 'text-extension', extension, normalizedMime);
  }
  if (isInconclusiveMime(normalizedMime) || isTextMime(normalizedMime)) {
    if (isTextMime(normalizedMime)) return result('text', 'TXT', 'mime', false, 'text-mime', extension, normalizedMime);
    return result('generic', safeExtensionBadge(extension), 'unknown', false, extension ? 'unknown-extension-inconclusive-mime' : 'extensionless-inconclusive-mime', extension, normalizedMime);
  }
  return result('generic', safeExtensionBadge(extension), 'mime', false, 'generic-mime', extension, normalizedMime);
}

export async function readAttachmentPrefix(file, limit = ATTACHMENT_PREFIX_BYTES) {
  if (!file || typeof file.slice !== 'function') throw new Error('a File/Blob with slice() is required');
  const size = Number.isFinite(file.size) ? Math.max(0, file.size) : limit;
  const end = Math.max(0, Math.min(size, limit));
  const blob = file.slice(0, end);
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('file prefix could not be read');
  const buffer = await blob.arrayBuffer();
  if (!(buffer instanceof ArrayBuffer)) throw new Error('file prefix read returned invalid data');
  return new Uint8Array(buffer).slice(0, Math.min(end, limit));
}

export async function classifyFile(file, limit = ATTACHMENT_PREFIX_BYTES) {
  if (!file || typeof file.name !== 'string') throw new Error('a named File is required');
  const prefix = await readAttachmentPrefix(file, limit);
  return classifyAttachment({ name: file.name, mime: file.type, prefix });
}
