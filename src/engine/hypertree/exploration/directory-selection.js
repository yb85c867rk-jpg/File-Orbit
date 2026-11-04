import { evaluateContextNodeAccess } from '../edition/context.js';

export const MAX_DIRECTORY_ENTRIES = 5000;

/** Capture file entries and loose files during the drop event itself. */
export function captureDataTransferItems(dataTransfer) {
  const entries = [];
  const files = [];
  const items = dataTransfer?.items;
  if (items && typeof items.length === 'number') {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item?.kind !== 'file') continue;
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
      else if (typeof item.getAsFile === 'function') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (entries.length === 0 && files.length === 0 && dataTransfer?.files) {
    for (const file of dataTransfer.files) files.push(file);
  }
  return { entries, files };
}

function readFile(entry) {
  return new Promise((resolve, reject) => {
    try { entry.file(resolve, reject); } catch (error) { reject(error); }
  });
}

async function readAllBatches(reader, path, isCurrent, budget) {
  const out = [];
  if (!reader || typeof reader.readEntries !== 'function') throw new Error('directory reader is unavailable');
  while (true) {
    if (!isCurrent()) throw new Error('stale-selection');
    const batch = await new Promise((resolve, reject) => {
      try { reader.readEntries(resolve, reject); } catch (error) { reject(error); }
    });
    if (!Array.isArray(batch)) throw new Error('directory reader returned invalid data');
    if (batch.length === 0) break;
    for (const entry of batch) {
      budget.count += 1;
      if (budget.count > budget.maxEntries) throw new Error('directory-entry-limit');
      out.push(entry);
    }
  }
  return out;
}

/** Recursively collect explicitly dropped directory entries with hard bounds. */
export async function collectDirectorySelection({ entries = [], files = [], maxEntries = MAX_DIRECTORY_ENTRIES, maxNodes = undefined, policyContext = undefined, isCurrent = () => true } = {}) {
  const nodeBudget = evaluateContextNodeAccess(policyContext, 1, maxNodes);
  if (!nodeBudget.ok) return { ok: false, reason: nodeBudget.reason === 'invalid-caller-limit' ? 'invalid-node-budget' : nodeBudget.reason, message: nodeBudget.message };
  const effectiveMaxNodes = nodeBudget.decision.effectiveLimit;
  const outFiles = [...files].map((file) => ({ file, relativePath: file.name }));
  const folders = [];
  let folderCount = 0; let fileCount = outFiles.length;
  if (fileCount + 1 > effectiveMaxNodes) return { ok: false, reason: 'node-limit', message: `A map is limited to ${effectiveMaxNodes} nodes including its root.` };
  const budget = { count: 0, maxEntries };
  const walk = async (entry, prefix) => {
    if (!isCurrent()) throw new Error('stale-selection');
    if (!entry || typeof entry !== 'object') throw new Error('invalid-entry');
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (!name) throw new Error('invalid-entry-name');
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.isDirectory) {
      folderCount += 1;
      if (1 + folderCount + fileCount > effectiveMaxNodes) throw new Error('node-limit');
      folders.push(path);
      if (typeof entry.createReader !== 'function') throw new Error('directory-reader-unavailable');
      const children = await readAllBatches(entry.createReader(), path, isCurrent, budget);
      const sorted = [...children].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      for (const child of sorted) await walk(child, path);
      return;
    }
    if (entry.isFile) {
      const file = await readFile(entry);
      if (!file || typeof file.size !== 'number') throw new Error('file-read-failed');
      const relativePath = prefix ? `${path}` : file.name;
      outFiles.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name });
      fileCount += 1;
      if (1 + folderCount + fileCount > effectiveMaxNodes) throw new Error('node-limit');
      return;
    }
    throw new Error('unsupported-entry');
  };
  try {
    for (const entry of entries) await walk(entry, '');
  } catch (error) {
    const reason = String(error?.message || error);
    return { ok: false, reason, message: reason === 'node-limit' ? `A map is limited to ${effectiveMaxNodes} nodes including its root.` : `Could not read the selected directory: ${reason}` };
  }
  if (!isCurrent()) return { ok: false, reason: 'stale-selection', message: 'The selection changed.' };
  return { ok: true, files: outFiles, folders, folderCount, fileCount, entryCount: budget.count, nodeLimit: effectiveMaxNodes };
}



