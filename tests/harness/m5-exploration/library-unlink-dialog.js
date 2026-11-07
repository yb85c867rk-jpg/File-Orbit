/**
 * Destructive confirmation for removing a Map Library connection only.
 * No filesystem mutation is performed here.
 */
export function createLibraryUnlinkDialog({ document, host, onUnlink, onCancel } = {}) {
  if (!document || !host) throw new Error('library unlink dialog requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'embed-dialog-backdrop library-unlink-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'embed-dialog library-unlink-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'library-unlink-title');
  dialog.setAttribute('aria-describedby', 'library-unlink-copy');
  const head = document.createElement('div');
  head.className = 'embed-dialog-head';
  const title = document.createElement('h2');
  title.id = 'library-unlink-title';
  title.textContent = 'Unlink this Map Library?';
  head.append(title);
  const copy = document.createElement('div');
  copy.className = 'embed-dialog-copy';
  const question = document.createElement('p');
  question.id = 'library-unlink-copy';
  const note = document.createElement('p');
  note.textContent = 'The folder and its .orbit files will remain on your computer.';
  const openNote = document.createElement('p');
  openNote.className = 'library-unlink-open-note';
  openNote.hidden = true;
  openNote.textContent = 'The open map will stay open and keep its existing save location.';
  const status = document.createElement('p');
  status.id = 'library-unlink-status';
  status.className = 'library-unlink-status';
  status.setAttribute('role', 'alert');
  status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'embed-dialog-actions permission-dialog-actions library-unlink-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = 'Cancel';
  const unlink = document.createElement('button');
  unlink.type = 'button'; unlink.textContent = 'Unlink';
  actions.append(cancel, unlink);
  copy.append(question, note, openNote, status, actions);
  dialog.append(head, copy);
  backdrop.append(dialog);
  host.append(backdrop);

  let open = false;
  let busy = false;
  let record = null;
  let lastFocus = null;

  const sync = () => {
    cancel.disabled = !open || busy;
    unlink.disabled = !open || busy || !record;
    dialog.setAttribute('aria-busy', String(busy));
  };
  const setStatus = (message, kind = 'info') => {
    status.textContent = message || '';
    status.dataset.kind = kind;
  };
  const close = ({ notify = true, restoreFocus = true } = {}) => {
    if (!open || busy) return false;
    open = false; record = null;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (notify) onCancel?.();
    if (restoreFocus) {
      try { if (lastFocus?.isConnected) lastFocus.focus(); } catch {}
    }
    lastFocus = null;
    sync();
    return true;
  };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!busy) close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [cancel, unlink].filter((button) => !button.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus(); return;
    }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  unlink.addEventListener('click', async () => {
    if (!open || busy || !record || typeof onUnlink !== 'function') return;
    busy = true; setStatus(''); sync();
    let result;
    try {
      result = await onUnlink(record);
    } catch (error) {
      result = { ok: false, message: String(error?.message || error) };
    }
    if (!open) return;
    if (result?.ok) {
      busy = false;
      close({ notify: false, restoreFocus: false });
      return;
    }
    busy = false; sync();
    if (['target-changed', 'unknown-library', 'stale'].includes(result?.reason)) {
      unlink.disabled = true;
      setStatus(String(result?.message || 'This Map Library changed. Cancel and try again.'), 'error');
      return;
    }
    setStatus(String(result?.message || 'The Map Library could not be unlinked. The existing connection is unchanged. You can retry.'), 'error');
  });
  cancel.addEventListener('click', () => { if (!busy) close(); });
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop && !busy) close(); });

  function show(target, { containsOpenMap = false, returnFocus = null } = {}) {
    if (open || !target) return false;
    open = true; busy = false; record = { ...target };
    question.textContent = `Remove ‘${String(target.name || target.handle?.name || 'this folder')}’ from FileOrbit’s linked Libraries?`;
    openNote.hidden = !containsOpenMap;
    setStatus('');
    sync();
    backdrop.hidden = false;
    lastFocus = returnFocus?.isConnected ? returnFocus : (document.activeElement || null);
    document.addEventListener('keydown', onKey, true);
    cancel.focus();
    return true;
  }
  function invalidate(message = 'This Map Library changed. Cancel and try again.') {
    if (!open || busy) return false;
    record = null; sync(); setStatus(message, 'error');
    return true;
  }

  return {
    show, close, invalidate, setError: setStatus,
    get open() { return open; }, get busy() { return busy; },
    get record() { return record ? { ...record } : null; },
    element: backdrop,
    destroy() { if (open && !busy) close({ notify: false, restoreFocus: false }); backdrop.remove(); }
  };
}
