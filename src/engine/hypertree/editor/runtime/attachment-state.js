import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../attachment-classification.js';

export function attachmentMap(loaded) { const map = new Map(); for (const a of loaded.attachments || []) map.set(a.attachmentId, a); return map; }
export function treeAttachmentRefs(tree) { const refs = []; const walk = (n) => { if (typeof n.data?.attachmentId === 'string') refs.push({ id: n.data.attachmentId, data: n.data }); for (const c of n.children || []) walk(c); }; walk(tree); return refs; }
export function currentAttachmentIds(tree) { return new Set(treeAttachmentRefs(tree).map((ref) => ref.id)); }
export function historyAttachmentIds(entries) { const ids = new Set(); for (const entry of entries || []) for (const id of entry?.attachmentRefs || []) ids.add(id); return ids; }
export function retainedAttachmentIds(tree, entries) { return new Set([...currentAttachmentIds(tree), ...historyAttachmentIds(entries)]); }
export function verifyAttachments(loaded, tree) {
  const map = attachmentMap(loaded); const refs = treeAttachmentRefs(tree); let total = 0;
  for (const a of map.values()) {
    if (!a || !a.blob) return { ok: false, reason: 'attachment-missing', message: 'A retained attachment payload is missing.' };
    if (!a.metadata || a.metadata.sizeBytes !== a.blob.size || a.metadata.sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'attachment-mismatch', message: 'Attachment metadata does not match its payload.' };
    total += a.blob.size;
  }
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) return { ok: false, reason: 'attachment-total-limit', message: 'Attachments exceed the map total limit.' };
  for (const ref of refs) {
    const a = map.get(ref.id);
    if (!a) return { ok: false, reason: 'attachment-missing', message: 'A referenced attachment payload is missing.' };
    if (ref.data.originalName !== a.metadata.originalName || ref.data.sizeBytes !== a.metadata.sizeBytes || ref.data.mime !== a.metadata.mime) return { ok: false, reason: 'attachment-reference-mismatch', message: 'Tree attachment metadata does not match the adopted attachment.' };
  }
  return { ok: true };
}
export function retainedAttachments(loaded, tree, entries) {
  const ids = retainedAttachmentIds(tree, entries);
  return (loaded.attachments || []).filter((a) => ids.has(a.attachmentId));
}
export function attachmentUsage(loaded, tree, entries) {
  const current = currentAttachmentIds(tree); const history = historyAttachmentIds(entries); const retained = new Set([...current, ...history]); const map = attachmentMap(loaded);
  let currentBytes = 0; let historyBytes = 0;
  for (const id of retained) { const a = map.get(id); const bytes = a?.blob?.size || 0; if (current.has(id)) currentBytes += bytes; else historyBytes += bytes; }
  return { currentCount: current.size, historyCount: history.size, retainedCount: retained.size, currentBytes, historyBytes, totalBytes: currentBytes + historyBytes };
}
