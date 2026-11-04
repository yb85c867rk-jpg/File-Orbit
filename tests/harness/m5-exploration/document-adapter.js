/**
 * Small feature-detected adapter for document files.
 * Writable handles are user-authorized handles from the File System Access API;
 * the download fallback is only a browser handoff and cannot confirm a write.
 */
export const ORBIT_FILE_TYPES = Object.freeze([Object.freeze({
  description: 'Orbit files (*.orbit)',
  accept: Object.freeze({ 'application/x-orbit': Object.freeze(['.orbit']) })
})]);

export function createDocumentAdapter({
  window = globalThis,
  document = globalThis.document,
  BrowserURL = globalThis.URL,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  const writableSupported = () => typeof window?.showOpenFilePicker === 'function' && typeof window?.showSaveFilePicker === 'function';
  const failure = (reason, stage, error = null) => ({
    ok: false,
    reason,
    stage,
    error,
    errorName: String(error?.name || ''),
    errorMessage: String(error?.message || '')
  });

  async function pickOpen({ types = ORBIT_FILE_TYPES } = {}) {
    if (!writableSupported()) return failure('unsupported', 'capability');
    let stage = 'picker';
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false, types, excludeAcceptAllOption: true });
      if (!handle) return failure('cancelled', 'picker');
      stage = 'permission-query';
      let permission = 'granted';
      if (typeof handle.queryPermission === 'function') permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        stage = 'permission-request';
        if (typeof handle.requestPermission !== 'function') return failure('permission-denied', stage);
        if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return failure('permission-denied', stage);
      }
      stage = 'file-read';
      const file = await handle.getFile();
      return { ok: true, handle, file, stage: 'ready' };
    } catch (error) {
      if (error?.name === 'AbortError') return failure('cancelled', stage, error);
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return failure('permission-denied', stage, error);
      return failure('open-failed', stage, error);
    }
  }

  async function pickSave(suggestedName) {
    if (!writableSupported()) return failure('unsupported', 'capability');
    let stage = 'picker';
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: ORBIT_FILE_TYPES,
        excludeAcceptAllOption: true
      });
      if (!handle) return failure('cancelled', 'picker');
      stage = 'permission-query';
      let permission = 'granted';
      if (typeof handle.queryPermission === 'function') permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        stage = 'permission-request';
        if (typeof handle.requestPermission !== 'function') return failure('permission-denied', stage);
        if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return failure('permission-denied', stage);
      }
      return { ok: true, handle, stage: 'ready' };
    } catch (error) {
      if (error?.name === 'AbortError') return failure('cancelled', stage, error);
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return failure('permission-denied', stage, error);
      return failure('save-picker-failed', stage, error);
    }
  }

  async function write(handle, blob) {
    let writable = null;
    let stage = 'createWritable';
    try {
      writable = await handle.createWritable();
      stage = 'write';
      await writable.write(blob);
      stage = 'close';
      await writable.close();
      return { ok: true, stage: 'closed' };
    } catch (error) {
      try { await writable?.abort?.(); } catch {}
      try { await writable?.close?.(); } catch {}
      return failure('write-failed', stage, error);
    }
  }

  function download(blob, filename) {
    if (typeof BrowserURL?.createObjectURL !== 'function' || typeof document?.createElement !== 'function') return failure('download-unavailable', 'download');
    let url = null; let anchor = null; let timer = null; let cleaned = false;
    try {
      url = BrowserURL.createObjectURL(blob);
      anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.hidden = true;
      document.body.append(anchor); anchor.click();
      timer = setTimeoutFn(() => { if (timer === null) return; try { anchor?.remove?.(); } catch {} try { BrowserURL.revokeObjectURL(url); } catch {} timer = null; }, 1000);
      return { ok: true, handoff: true, stage: 'handoff', url, cleanup() { if (cleaned) return; cleaned = true; if (timer !== null) clearTimeoutFn(timer); timer = null; try { anchor?.remove?.(); } catch {} try { if (url) BrowserURL.revokeObjectURL(url); } catch {} } };
    } catch (error) {
      try { anchor?.remove?.(); } catch {}
      try { if (url) BrowserURL.revokeObjectURL(url); } catch {}
      return failure('download-failed', 'download', error);
    }
  }

  return { get writableSupported() { return writableSupported(); }, pickOpen, pickSave, write, download };
}
