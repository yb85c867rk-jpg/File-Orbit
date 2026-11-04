/**
 * Owns per-download browser resources. Each record has its own URL, anchor,
 * and timer; timers never read another record's mutable fields.
 */
export function createDownloadResourceManager({
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancelTimer = (timer) => clearTimeout(timer),
  delayMs = 1000
} = {}) {
  const records = new Set();
  const cleanup = (record) => {
    if (!record || !records.has(record)) return false;
    records.delete(record);
    if (record.timer !== null) { try { cancelTimer(record.timer); } catch {} record.timer = null; }
    if (record.anchor) { try { record.anchor.remove(); } catch {} record.anchor = null; }
    if (record.url) { const url = record.url; record.url = null; try { revokeObjectUrl(url); } catch {} }
    record.revoked = true;
    return true;
  };
  const own = ({ url, anchor = null }) => {
    if (typeof url !== 'string' || url.length === 0) throw new Error('A download URL is required.');
    const record = { url, anchor, timer: null, revoked: false };
    records.add(record);
    record.timer = schedule(() => cleanup(record), delayMs);
    return record;
  };
  const cleanupAll = () => {
    let count = 0;
    for (const record of [...records]) if (cleanup(record)) count += 1;
    return count;
  };
  return { own, cleanup, cleanupAll, get size() { return records.size; } };
}
