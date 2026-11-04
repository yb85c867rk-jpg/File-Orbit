export const HISTORY_LIMITS = Object.freeze({ maxEntries: 20, maxEntryBytes: 2 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 });
const encoder = new TextEncoder();
export function serializedHistoryBytes(entry) { return encoder.encode(JSON.stringify(entry)).byteLength; }
export function createEditorHistory(options = {}) {
  const limits = { ...HISTORY_LIMITS, ...options };
  let undo = [];
  let redo = [];
  const sum = (items) => items.reduce((value, entry) => value + entry.bytes, 0);
  return {
    planAdd(entry) {
      const bytes = serializedHistoryBytes(entry);
      if (bytes > limits.maxEntryBytes) return { ok: false, reason: 'history-entry-limit', message: 'This change is too large to retain in undo history.' };
      const retained = { ...entry, bytes };
      const nextUndo = [...undo, retained];
      const evicted = [];
      while (nextUndo.length > limits.maxEntries || sum(nextUndo) > limits.maxTotalBytes) evicted.push(nextUndo.shift());
      if (!nextUndo.length || sum(nextUndo) > limits.maxTotalBytes) return { ok: false, reason: 'history-total-limit', message: 'This change cannot fit in the bounded undo history.' };
      return { ok: true, entry: retained, undo: nextUndo, redo: [], evicted, clearedRedo: redo, bytes, resultingBytes: sum(nextUndo), attachmentRefs: entry.attachmentRefs || [] };
    },
    commitAdd(plan) { if (!plan?.ok) return false; undo = plan.undo; redo = plan.redo; return true; },
    planUndo() { if (!undo.length) return { ok: false, reason: 'empty-undo' }; const entry = undo.at(-1); return { ok: true, entry, undo: undo.slice(0, -1), redo: [...redo, entry] }; },
    planRedo() { if (!redo.length) return { ok: false, reason: 'empty-redo' }; const entry = redo.at(-1); return { ok: true, entry, undo: [...undo, entry], redo: redo.slice(0, -1) }; },
    commitMove(plan) { if (!plan?.ok) return false; undo = plan.undo; redo = plan.redo; return true; },
    clear() { undo = []; redo = []; },
    get undoCount() { return undo.length; },
    get redoCount() { return redo.length; },
    get totalBytes() { return sum(undo) + sum(redo); },
    get undo() { return [...undo]; },
    get redo() { return [...redo]; }
  };
}
